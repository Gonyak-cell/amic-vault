import React, { type FormEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientDto, ClientListDto } from '@amic-vault/shared';
import { createClient, listClients } from '@/lib/api-client';
import { ClientCreateDialog, type ClientCreateDialogProps } from './client-create-dialog';
import ClientsPage from './page';

const hookHarness = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  refIndex: 0,
  refs: [] as Array<{ current: unknown }>,
  stateIndex: 0,
  states: [] as unknown[],
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useCallback: <T,>(callback: T) => callback,
    useEffect: (effect: () => void | (() => void)) => {
      hookHarness.effects.push(effect);
    },
    useRef: <T,>(initial: T) => {
      const index = hookHarness.refIndex++;
      hookHarness.refs[index] ??= { current: initial };
      return hookHarness.refs[index] as { current: T };
    },
    useState: <T,>(initial: T) => {
      const index = hookHarness.stateIndex++;
      const isClientForm =
        typeof initial === 'object' &&
        initial !== null &&
        'aliasesText' in initial &&
        'clientType' in initial &&
        'confidentialityLevel' in initial &&
        'name' in initial;
      if (hookHarness.states[index] === undefined) {
        hookHarness.states[index] = isClientForm
          ? {
              aliasesText: '',
              clientType: 'corporation',
              confidentialityLevel: 'standard',
              name: '새 고객',
            }
          : initial;
      }
      const setState = (next: T | ((current: T) => T)) => {
        const current = hookHarness.states[index] as T;
        hookHarness.states[index] =
          typeof next === 'function' ? Reflect.apply(next, undefined, [current]) : next;
      };
      return [hookHarness.states[index] as T, setState] as const;
    },
  };
});

vi.mock('@/lib/api-client', () => ({
  ApiClientError: class ApiClientError extends Error {
    code = 'VALIDATION_FAILED';
  },
  createClient: vi.fn(),
  listClients: vi.fn(),
}));

describe('ClientsPage request generation effects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookHarness.effects.length = 0;
    hookHarness.refIndex = 0;
    hookHarness.refs.length = 0;
    hookHarness.stateIndex = 0;
    hookHarness.states.length = 0;
    vi.stubGlobal('window', {
      requestAnimationFrame: (callback: () => void) => {
        callback();
        return 1;
      },
    });
  });

  it('does not let a stale initial list overwrite a newly created client', async () => {
    const staleList = deferred<ClientListDto>();
    vi.mocked(listClients).mockReturnValueOnce(staleList.promise);
    vi.mocked(createClient).mockResolvedValueOnce(createdClient);

    const page = ClientsPage();
    const dialog = React.Children.toArray(page.props.children).find(
      (child) => React.isValidElement(child) && child.type === ClientCreateDialog,
    );
    if (!React.isValidElement<ClientCreateDialogProps>(dialog)) {
      throw new Error('Client creation dialog is missing');
    }

    hookHarness.effects[0]?.();
    expect(listClients).toHaveBeenCalledOnce();

    await dialog.props.onSubmit(formSubmitEvent());
    expect(createClient).toHaveBeenCalledOnce();
    expect(hookHarness.states[0]).toEqual([createdClient]);

    staleList.resolve(clientListResult('오래된 목록'));
    await flushPromises();

    expect(hookHarness.states[0]).toEqual([createdClient]);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

function formSubmitEvent(): FormEvent<HTMLFormElement> {
  const formTarget = new EventTarget() as EventTarget & HTMLFormElement;
  return {
    bubbles: true,
    cancelable: true,
    currentTarget: formTarget,
    defaultPrevented: false,
    eventPhase: 2,
    isDefaultPrevented: () => false,
    isPropagationStopped: () => false,
    isTrusted: true,
    nativeEvent: new Event('submit'),
    persist: () => undefined,
    preventDefault: vi.fn(),
    stopPropagation: () => undefined,
    target: formTarget,
    timeStamp: 0,
    type: 'submit',
  };
}

function clientListResult(name: string): ClientListDto {
  return {
    items: [{ ...createdClient, displayName: name, name }],
    page: 1,
    pageSize: 100,
    totalCount: 1,
  };
}

const createdClient: ClientDto = {
  aliases: [],
  clientId: '22222222-2222-4222-8222-222222222222',
  clientType: 'corporation',
  confidentialityLevel: 'standard',
  createdAt: '2026-07-31T00:00:00.000Z',
  createdBy: '11111111-1111-4111-8111-111111111112',
  displayName: '새 고객',
  metadata: {},
  name: '새 고객',
  status: 'active',
  tenantId: '11111111-1111-4111-8111-111111111100',
  updatedAt: '2026-07-31T00:00:00.000Z',
};
