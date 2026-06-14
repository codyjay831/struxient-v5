export class PlatformAccessDeniedError extends Error {
  readonly code = "PLATFORM_ACCESS_DENIED" as const;

  constructor(message = "Platform access denied.") {
    super(message);
    this.name = "PlatformAccessDeniedError";
  }
}
