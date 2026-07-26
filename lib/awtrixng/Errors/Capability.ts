export type UnsupportedReason =
  | 'protocol-unsupported'
  | 'firmware-unsupported'
  | 'hardware-unavailable'
  | 'configuration-disabled'
  | 'unknown-requires-probe';

export interface SupportedCapability {
  supported: true;
}

export interface UnsupportedCapability {
  supported: false;
  reason: UnsupportedReason;
  details?: string;
}

export type CapabilitySupport = SupportedCapability | UnsupportedCapability;

export type CapabilitySupportMap<Capability extends string = string> = Record<Capability, CapabilitySupport>;

export const capabilitySupported = (): SupportedCapability => ({
  supported: true,
});

export const capabilityUnsupported = (reason: UnsupportedReason, details?: string): UnsupportedCapability => {
  const support: UnsupportedCapability = {
    supported: false,
    reason,
  };

  if (details !== undefined) {
    support.details = details;
  }

  return support;
};

export const isCapabilitySupported = (support: CapabilitySupport): support is SupportedCapability => support.supported;
