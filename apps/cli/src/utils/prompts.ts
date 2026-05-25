import { isInteractive } from "./tty.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SelectOption<T = string> {
  name: string;
  value: T;
  description?: string;
}

export interface PromptSelectOptions {
  defaultIndex?: number;
  pageSize?: number;
}

export interface PromptCheckboxOptions<T = string> {
  defaults?: T[];
  pageSize?: number;
  required?: boolean;
}

export interface PromptConfirmOptions {
  defaultVal?: boolean;
}

export interface PromptInputOptions {
  defaultVal?: string;
  required?: boolean;
  validate?: (v: string) => true | string;
}

export interface PromptSearchOptions {
  pageSize?: number;
}

export interface PromptPasswordOptions {
  validate?: (v: string) => true | string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function hasYesFlag(): boolean {
  return process.argv.includes("--yes");
}

function requireInteractive(reason: string): never {
  throw new Error(
    "Cannot prompt in non-interactive mode: " + reason + ". " +
    "Use --yes to accept defaults or provide values via flags."
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Choose one option from a list.
 * Interactive: uses @inquirer/prompts select with arrow-key navigation.
 * Non-interactive with --yes: returns the default (first choice).
 * Non-interactive without --yes: throws an actionable error.
 */
export async function promptSelect<T = string>(
  message: string,
  choices: SelectOption<T>[],
  opts?: PromptSelectOptions
): Promise<T> {
  if (!isInteractive()) {
    if (hasYesFlag()) {
      const idx = opts?.defaultIndex ?? 0;
      return choices[idx]?.value ?? choices[0]?.value;
    }
    requireInteractive("select requires an interactive terminal");
  }

  const { select } = await import("@inquirer/prompts");

  const defaultVal =
    opts?.defaultIndex != null ? choices[opts.defaultIndex]?.value : undefined;

  return select<T>({
    message,
    choices,
    default: defaultVal,
    pageSize: opts?.pageSize,
    loop: true,
  });
}

/**
 * Select multiple options from a list.
 * Interactive: uses @inquirer/prompts checkbox.
 * Non-interactive with --yes: returns the configured defaults or empty array.
 * Non-interactive without --yes: throws an actionable error.
 */
export async function promptCheckbox<T = string>(
  message: string,
  choices: SelectOption<T>[],
  opts?: PromptCheckboxOptions<T>
): Promise<T[]> {
  if (!isInteractive()) {
    if (hasYesFlag()) {
      return opts?.defaults ?? [];
    }
    requireInteractive("checkbox requires an interactive terminal");
  }

  const { checkbox } = await import("@inquirer/prompts");

  const checkedChoices = choices.map((c) => {
    const choice = { ...c } as any;
    if (opts?.defaults !== undefined) {
      choice.checked = opts.defaults.includes(c.value);
    } else if (choice.checked === undefined) {
      choice.checked = false;
    }
    return choice;
  });

  return checkbox<T>({
    message,
    choices: checkedChoices,
    pageSize: opts?.pageSize,
    required: opts?.required,
    loop: true,
  });
}

/**
 * Yes/no confirmation prompt.
 * Interactive: uses @inquirer/prompts confirm.
 * Non-interactive with --yes: returns the configured default or false.
 * Non-interactive without --yes: throws an actionable error.
 */
export async function promptConfirm(
  message: string,
  opts?: PromptConfirmOptions
): Promise<boolean> {
  if (!isInteractive()) {
    if (hasYesFlag()) {
      return opts?.defaultVal ?? false;
    }
    requireInteractive("confirm requires an interactive terminal");
  }

  const { confirm } = await import("@inquirer/prompts");

  return confirm({
    message,
    default: opts?.defaultVal,
  });
}

/**
 * Free-form text input.
 * Interactive: uses @inquirer/prompts input.
 * Non-interactive with --yes: returns the configured default or empty string.
 * Non-interactive without --yes: throws an actionable error.
 */
export async function promptInput(
  message: string,
  opts?: PromptInputOptions
): Promise<string> {
  if (!isInteractive()) {
    if (hasYesFlag()) {
      return opts?.defaultVal ?? "";
    }
    requireInteractive("input requires an interactive terminal");
  }

  const { input } = await import("@inquirer/prompts");

  return input({
    message,
    default: opts?.defaultVal,
    required: opts?.required,
    validate: opts?.validate,
  });
}

/**
 * Type-to-filter search selection.
 * Interactive: uses @inquirer/prompts search.
 * Non-interactive with --yes: calls source(undefined) and returns the first result.
 * Non-interactive without --yes: throws an actionable error.
 */
export async function promptSearch<T = string>(
  message: string,
  source: (term: string | undefined) => Promise<SelectOption<T>[]>,
  opts?: PromptSearchOptions
): Promise<T> {
  if (!isInteractive()) {
    if (hasYesFlag()) {
      const results = await source(undefined);
      if (results.length === 0) {
        throw new Error("No search results available for selection.");
      }
      return results[0].value;
    }
    requireInteractive("search requires an interactive terminal");
  }

  const { search } = await import("@inquirer/prompts");

  return search<T>({
    message,
    source: async (input: string | undefined) => {
      const results = await source(input);
      return results.map((r) => ({
        name: r.name,
        value: r.value,
        description: r.description,
      }));
    },
    pageSize: opts?.pageSize,
  });
}

/**
 * Hidden text input (for API keys, passwords).
 * Interactive: uses @inquirer/prompts password.
 * Non-interactive: ALWAYS throws — --yes cannot supply a password.
 * Use --api-key flag or vault to provide credentials non-interactively.
 */
export async function promptPassword(
  message: string,
  opts?: PromptPasswordOptions
): Promise<string> {
  if (!isInteractive()) {
    throw new Error(
      "Cannot prompt for password in non-interactive mode. " +
      "Use --api-key flag or configure via synapse vault."
    );
  }

  const { password } = await import("@inquirer/prompts");

  return password({
    message,
    mask: true,
    validate: opts?.validate,
  });
}
