/**
 * OpenCode 2 plugin entry point.
 *
 * Same bridge as the Pi extension (index.ts) — local proxy, JetBrains OAuth,
 * Grazie model list — wired into OpenCode's plugin API instead:
 *
 * - integration: a "JetBrains Junie" OAuth method, so `opencode2 auth login`
 *   (and the TUI's connect dialog) can log in. OpenCode stores the credential
 *   and calls `refresh` when it is about to expire.
 * - catalog: a "junie" provider whose models point at the local proxy. OpenCode
 *   hands the OAuth access token to the model client, which sends it to the
 *   proxy as a bearer token / x-goog-api-key — exactly what the proxy expects.
 */

import { startServer } from "./lib/server.mjs";
import { startJunieLogin, junieRefreshToken } from "./lib/oauth.mjs";
import { KNOWN_GRAZIE_MODELS, getModelMeta, isLegacyModel } from "./lib/models.mjs";

const PROVIDER_ID = "junie";
const METHOD_ID = "browser";

// OpenCode gives up on a pending OAuth attempt after 10 minutes; the callback
// server should not outlive it.
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

// The OpenAI Responses settings OpenCode itself uses for reasoning models
// (see models.dev variants): the summary makes reasoning visible, and the
// encrypted content lets it be replayed with store: false.
const openaiEffort = (effort) =>
  effort === "none"
    ? { reasoningEffort: "none" }
    : { reasoningEffort: effort, reasoningSummary: "auto", include: ["reasoning.encrypted_content"] };

/**
 * Per family: which AI SDK package OpenCode should drive, where on the proxy it
 * lands, and the reasoning variants (selectable in OpenCode as model#variant).
 */
const FAMILIES = [
  {
    prefix: "claude-",
    package: "aisdk:@ai-sdk/anthropic",
    path: "/v1", // → /v1/messages
    // Junie runs Claude with adaptive thinking; effort steers how much
    variants: ["low", "medium", "high", "max"].map((effort) => ({
      id: effort,
      settings: { thinking: { type: "adaptive" }, effort },
    })),
  },
  {
    prefix: "openai-",
    package: "aisdk:@ai-sdk/openai",
    path: "/v1", // → /v1/responses
    variants: ["none", "minimal", "low", "medium", "high", "xhigh"].map((effort) => ({
      id: effort,
      settings: openaiEffort(effort),
    })),
  },
  {
    prefix: "grok-",
    package: "aisdk:@ai-sdk/openai",
    path: "/v1", // → /v1/responses, routed to xAI by the proxy
    // Grok rejects reasoning effort "none"
    variants: ["low", "medium", "high"].map((effort) => ({ id: effort, settings: openaiEffort(effort) })),
  },
  {
    prefix: "gemini-",
    package: "aisdk:@ai-sdk/google",
    path: "/google/v1beta", // → /google/v1beta/models/<id>:streamGenerateContent
    variants: ["low", "medium", "high"].map((level) => ({
      id: level,
      settings: { thinkingConfig: { includeThoughts: true, thinkingLevel: level } },
    })),
  },
];

function familyOf(id) {
  return FAMILIES.find((f) => id.startsWith(f.prefix));
}

/** Pi's credential shape → OpenCode's CredentialOAuth. */
function toCredential({ access, refresh, expires }) {
  return { type: "oauth", methodID: METHOD_ID, access, refresh, expires };
}

export default {
  id: "jetbrains-junie-bridge",
  async setup(ctx) {
    // Start proxy on ephemeral port (OS assigns a free port)
    const { server, port } = await startServer();
    const proxyBase = `http://127.0.0.1:${port}`;

    await ctx.integration.transform((draft) => {
      draft.update(PROVIDER_ID, (integration) => {
        integration.name = "JetBrains Junie";
      });
      draft.method.update({
        integrationID: PROVIDER_ID,
        method: { id: METHOD_ID, type: "oauth", label: "Login with JetBrains Account" },
        async authorize() {
          const { url, credentials } = await startJunieLogin({ timeoutMs: LOGIN_TIMEOUT_MS });
          return {
            mode: "auto",
            url,
            instructions: "Complete the JetBrains login in your browser. This window will close automatically.",
            callback: credentials.then(toCredential),
          };
        },
        refresh: async (credential) => toCredential(await junieRefreshToken(credential)),
      });
    });

    await ctx.catalog.transform((draft) => {
      draft.provider.update(PROVIDER_ID, (provider) => {
        provider.name = "JetBrains Junie";
        provider.integrationID = PROVIDER_ID;
      });

      for (const id of KNOWN_GRAZIE_MODELS) {
        const family = familyOf(id);
        if (!family || isLegacyModel(id)) continue;
        const meta = getModelMeta(id);

        draft.model.update(PROVIDER_ID, id, (model) => {
          model.name = `${id} (Junie)`;
          model.package = family.package;
          model.settings = { ...model.settings, baseURL: `${proxyBase}${family.path}` };
          model.capabilities = { tools: true, input: ["text", "image"], output: ["text"] };
          model.variants = meta.reasoning ? structuredClone(family.variants) : [];
          // Usage is billed against the Junie subscription, not per token
          model.cost = [];
          model.limit = { context: meta.contextWindow, output: meta.maxTokens };
          model.status = "active";
          model.enabled = true;
        });
      }
    });

    // Shutdown: close proxy when OpenCode unloads the plugin
    return () => {
      server.close();
    };
  },
};
