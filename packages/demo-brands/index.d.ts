export interface DemoBrand {
  readonly name: string;
  readonly shortName: string;
  readonly logo: string;
}
export const DEMO_BRANDS: Readonly<Record<string, DemoBrand>>;
export const LEGACY_LOGOS: Readonly<Record<string, string>>;
export function demoCustomer<T extends { readonly identifier: string }>(customer: T): T;
export function demoText(text: string): string;
export function demoPresentation<T>(value: T): T;
