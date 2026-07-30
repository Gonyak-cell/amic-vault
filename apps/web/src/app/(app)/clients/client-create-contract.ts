import {
  createClientSchema,
  type ClientConfidentialityLevel,
  type ClientDto,
  type ClientType,
} from '@amic-vault/shared';

export interface NewClientFormState {
  name: string;
  aliasesText: string;
  clientType: ClientType;
  confidentialityLevel: ClientConfidentialityLevel;
}

export function prependCreatedClient(current: ClientDto[], created: ClientDto): ClientDto[] {
  return [created, ...current.filter((client) => client.clientId !== created.clientId)];
}

export function parseClientAliases(value: string): string[] {
  const aliases = value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(aliases)];
}

export function buildCreateClientInput(form: NewClientFormState) {
  const aliases = parseClientAliases(form.aliasesText);
  return createClientSchema.parse({
    name: form.name,
    aliases: aliases.length > 0 ? aliases : undefined,
    clientType: form.clientType,
    confidentialityLevel: form.confidentialityLevel,
    status: 'active',
  });
}
