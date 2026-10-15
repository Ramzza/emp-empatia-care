export async function register() {
  const productionServer = process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build";
  if (productionServer) {
    const { assertProductionConfig } = await import("./lib/server/config");
    assertProductionConfig();
  }
}
