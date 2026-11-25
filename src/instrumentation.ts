export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build" &&
    process.env.OCLR_DISCORD_RESULT_KEY
  ) {
    const { startDiscordResultDelivery } =
      await import("./lib/discord-result-delivery");
    startDiscordResultDelivery();
  }
}
