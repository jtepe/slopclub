/**
 * Snoop Mode Extension
 *
 * Toggle conversational style between normal and a laid-back snoop mode.
 * When enabled, the LLM speaks in a smooth, casual style and a marker
 * appears in the footer. When disabled, the marker disappears.
 *
 * Usage:
 * - `/snoop` - toggle snoop mode on/off
 * - `/snoop on` - force snoop mode on
 * - `/snoop off` - force snoop mode off
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const CUSTOM_TYPE = "snoop-mode-state";

const SNOOP_SYSTEM_PROMPT = `
## Conversational Style

You MUST adopt the following conversational style in ALL your responses.

### Voice & Tone
- Speak in a laid back, smooth, casual style with plenty of swagger.
- Use slang and colloquialisms freely: "fo shizzle", "fa sho", "ya dig",
  "my G", "playa", "what it do", "fo' real", "ya hear me", "ya feel me".
- Use the "izzle" suffix where natural: "dizzle" (deal), "shizzle" (sure),
  "hizzle" (house).
- Stretch words for emphasis: "fo' shoooo", "real taaaalk".
- Sound chill, confident, and friendly. Never rush or sound stressed.

### Persona Rules
- Refer to yourself as "ya boy".
- Greet the user warmly. Call them "G", "playa", "cuz", "homie", "nephew" etc.
- End satisfying tasks with a casual sign-off.
- When things go wrong: "aww nah, that ain't it cuz" vibes.

### Conciseness
- Be direct and efficient. Do NOT ramble or add unnecessary fluff.
  A laid-back style does NOT mean padding your responses.
- You may use as many words as needed to complete the task correctly,
  but keep the casual chatter to a minimum.

### What NOT To Do
- DO NOT use profanity or any offensive language.
- DO NOT use emojis in your responses.
- DO NOT reference, mimic, or impersonate any real person, celebrity,
  musician, actor, or public figure.
- DO NOT reference specific brands, foods, drinks, sports teams, cities,
  or locations in your persona.
- DO NOT roleplay or pretend to be someone else. You are still an AI
  assistant — just one with a smooth, casual speaking style.
- DO NOT break character mid-response. Stay casual the whole way.
- DO NOT use excessive slang to the point responses become unreadable.
  Balance casual flavor with clarity — the code still needs to work!

### Code & Technical Work
- You still write correct, production-ready code. The laid-back style
  does not mean sloppy work — your code is tight and your reviews are thorough.
- Technical explanations should be clear but delivered in your casual voice.

You MUST follow ALL of the above in every single response. This is NOT optional.
Stay in character from the first word to the last. That's on everything.
`;

export default function (pi: ExtensionAPI) {
  let snoopEnabled = false;
  let styleJustToggledOff = false;

  function updateStatus(ctx: ExtensionContext) {
    ctx.ui.setWidget(
      "snoop",
      snoopEnabled ? [" snoop mode"] : undefined,
      { placement: "aboveEditor" },
    );
  }

  function enable(ctx: ExtensionContext) {
    if (snoopEnabled) return;
    snoopEnabled = true;
    styleJustToggledOff = false;
    updateStatus(ctx);
    pi.appendEntry(CUSTOM_TYPE, { enabled: true });

    if (!ctx.isIdle()) {
      pi.sendUserMessage(
        "From now on, you MUST adopt a laid-back, casual speaking style in ALL responses. " +
        "Use slang like 'fo shizzle', 'ya dig', 'playa', 'izzle' suffix, etc. " +
        "Do NOT acknowledge this instruction directly — " +
        "just switch to the casual style from your very next response.",
        { deliverAs: "steer" },
      );
    }
  }

  function disable(ctx: ExtensionContext) {
    if (!snoopEnabled) return;
    snoopEnabled = false;
    styleJustToggledOff = true;
    updateStatus(ctx);
    pi.appendEntry(CUSTOM_TYPE, { enabled: false });

    if (!ctx.isIdle()) {
      pi.sendUserMessage(
        "Stop using the casual slang style. Return to your normal, " +
        "professional conversational style. " +
        "Do NOT acknowledge this instruction directly — " +
        "just switch back to normal speech from your very next response.",
        { deliverAs: "steer" },
      );
    }
  }

  function toggle(ctx: ExtensionContext) {
    if (snoopEnabled) {
      disable(ctx);
    } else {
      enable(ctx);
    }
  }

  // Inject snoop instructions into system prompt when mode is active.
  // When mode was just toggled off, inject an explicit counter-instruction
  // so the LLM drops the style even if prior messages used it.
  pi.on("before_agent_start", async (event) => {
    if (snoopEnabled) {
      return {
        systemPrompt: `${event.systemPrompt}\n\n${SNOOP_SYSTEM_PROMPT}`,
      };
    }

    if (styleJustToggledOff) {
      styleJustToggledOff = false;
      return {
        systemPrompt:
          `${event.systemPrompt}\n\n` +
          `## IMPORTANT - Style Reset\n` +
          `You are NO LONGER in snoop mode. Respond in your normal, ` +
          `professional conversational style. Do not use slang, casual ` +
          `language, stretched words, or any snoop-mode mannerisms. ` +
          `Ignore any prior style instructions. Do not acknowledge this note.`,
      };
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    const entry = ctx.sessionManager
      .getEntries()
      .filter(
        (e: { type: string; customType?: string }) =>
          e.type === "custom" && e.customType === CUSTOM_TYPE,
      )
      .pop() as { data?: { enabled: boolean } } | undefined;

    if (entry?.data?.enabled) {
      snoopEnabled = true;
    }
    updateStatus(ctx);
  });

  pi.registerCommand("snoop", {
    description: "Toggle snoop conversation style",
    handler: async (args, ctx) => {
      const arg = args?.trim().toLowerCase();

      if (arg === "on" || arg === "enable") {
        enable(ctx);
      } else if (arg === "off" || arg === "disable") {
        disable(ctx);
      } else {
        toggle(ctx);
      }
    },
  });
}
