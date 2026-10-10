export class ExtensionSdkError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly extensionId?: string,
  ) {
    super(message);
    this.name = "ExtensionSdkError";
  }
}

export class ExtensionValidationError extends ExtensionSdkError {
  constructor(message: string, extensionId?: string) {
    super("EXTENSION_INVALID", message, extensionId);
    this.name = "ExtensionValidationError";
  }
}

export class ExtensionConflictError extends ExtensionSdkError {
  constructor(resource: string, id: string, extensionId?: string) {
    super(
      "EXTENSION_CONFLICT",
      `${resource} identifier "${id}" is already registered`,
      extensionId,
    );
    this.name = "ExtensionConflictError";
  }
}

export class ExtensionDependencyError extends ExtensionSdkError {
  constructor(message: string, extensionId?: string) {
    super("EXTENSION_DEPENDENCY_ERROR", message, extensionId);
    this.name = "ExtensionDependencyError";
  }
}

export class ExtensionTimeoutError extends ExtensionSdkError {
  constructor(operation: string, timeoutMs: number, extensionId?: string) {
    super(
      "EXTENSION_TIMEOUT",
      `${operation} exceeded its ${timeoutMs}ms timeout`,
      extensionId,
    );
    this.name = "ExtensionTimeoutError";
  }
}
