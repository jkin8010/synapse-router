import { createContext, useContext, useReducer, createElement } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ProviderCard {
  provider: { id: string; name: string; description?: string };
  source?: string;
  service?: {
    id: string;
    name: string;
    base_url: string;
    auth_type: string;
  };
  features: Array<{ feature_id: string; feature_name?: string; intent: string }>;
}

export type AppStatus = "idle" | "loading" | "negotiating" | "executing" | "mock-testing" | "error";

export type TabId = "formatted" | "raw" | "logs" | "errors" | "typescript" | "python";

export interface LogEntry {
  level: "info" | "warn" | "error";
  message: string;
  timestamp: number;
}

export interface NegotiationResult {
  accepted: unknown[];
  rejected: unknown[];
  logs?: LogEntry[];
}

export interface ExecutionResult {
  output: unknown;
  timing?: { duration: number };
}

export interface MockResult {
  passed: boolean;
  expected: string[];
  got: string[];
  fieldCoverage: string;
  missingFields: string[];
  extraFields: string[];
  typeMismatches: string[];
}

export interface AppError {
  code: string;
  message: string;
  details?: unknown;
}

export interface AppState {
  providers: ProviderCard[];
  selectedProviderId: string | null;
  schema: string;
  schemaValid: boolean;
  negotiationResult: NegotiationResult | null;
  executionResult: ExecutionResult | null;
  mockTestResult: MockResult | null;
  logs: LogEntry[];
  errors: AppError[];
  activeTab: TabId;
  status: AppStatus;
  timing: { negotiate?: number; execute?: number };
  selectedBaseUrl: string | null;
}

// ── Actions ────────────────────────────────────────────────────────────────

export type AppAction =
  | { type: "SET_PROVIDERS"; providers: ProviderCard[] }
  | { type: "SELECT_PROVIDER"; providerId: string | null }
  | { type: "UPDATE_SCHEMA"; schema: string; valid: boolean }
  | { type: "SET_NEGOTIATION_RESULT"; result: NegotiationResult; duration: number }
  | { type: "SET_EXECUTION_RESULT"; result: ExecutionResult; duration: number }
  | { type: "SET_MOCK_TEST_RESULT"; result: MockResult }
  | { type: "SET_STATUS"; status: AppStatus }
  | { type: "SET_ACTIVE_TAB"; tab: TabId }
  | { type: "ADD_LOG"; entry: LogEntry }
  | { type: "ADD_ERROR"; error: AppError }
  | { type: "CLEAR_ERRORS" }
  | { type: "SET_BASE_URL"; baseUrl: string | null };

// ── Default Schema ─────────────────────────────────────────────────────────

const DEFAULT_SCHEMA = JSON.stringify(
  {
    agent_id: "my-agent",
    agent_name: "My Agent",
    version: "1.0.0",
    features: [
      {
        feature_id: "chat",
        intent: "chat",
        input_schema: {
          name: "input",
          fields: [
            {
              name: "messages",
              type: "array",
              required: true,
              description: "对话消息列表",
            },
          ],
        },
        output_schema: {
          name: "output",
          fields: [
            {
              name: "choices",
              type: "array",
              description: "模型返回的 choices",
            },
          ],
        },
      },
    ],
  },
  null,
  2,
);

// ── Initial State ──────────────────────────────────────────────────────────

export const initialState: AppState = {
  providers: [],
  selectedProviderId: null,
  schema: DEFAULT_SCHEMA,
  schemaValid: true,
  negotiationResult: null,
  executionResult: null,
  mockTestResult: null,
  logs: [],
  errors: [],
  activeTab: "formatted",
  status: "idle",
  timing: {},
  selectedBaseUrl: null,
};

// ── Reducer ────────────────────────────────────────────────────────────────

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_PROVIDERS":
      return { ...state, providers: action.providers };
    case "SELECT_PROVIDER":
      return { ...state, selectedProviderId: action.providerId };
    case "UPDATE_SCHEMA":
      return { ...state, schema: action.schema, schemaValid: action.valid };
    case "SET_NEGOTIATION_RESULT":
      return {
        ...state,
        negotiationResult: action.result,
        timing: { ...state.timing, negotiate: action.duration },
      };
    case "SET_EXECUTION_RESULT":
      return {
        ...state,
        executionResult: action.result,
        timing: { ...state.timing, execute: action.duration },
      };
    case "SET_MOCK_TEST_RESULT":
      return { ...state, mockTestResult: action.result };
    case "SET_STATUS":
      return { ...state, status: action.status };
    case "SET_ACTIVE_TAB":
      return { ...state, activeTab: action.tab };
    case "ADD_LOG":
      return { ...state, logs: [...state.logs, action.entry] };
    case "ADD_ERROR":
      return { ...state, errors: [...state.errors, action.error] };
    case "CLEAR_ERRORS":
      return { ...state, errors: [] };
    case "SET_BASE_URL":
      return { ...state, selectedBaseUrl: action.baseUrl };
    default:
      return state;
  }
}

// ── Split Contexts ─────────────────────────────────────────────────────────

const AppStateContext = createContext<AppState | null>(null);
const AppDispatchContext = createContext<React.Dispatch<AppAction> | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return createElement(
    AppStateContext.Provider,
    { value: state },
    createElement(
      AppDispatchContext.Provider,
      { value: dispatch },
      children,
    ),
  );
}

// ── Consumer Hooks ─────────────────────────────────────────────────────────

export function useAppState(): AppState {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used within an AppProvider");
  }
  return context;
}

export function useDispatch(): React.Dispatch<AppAction> {
  const context = useContext(AppDispatchContext);
  if (!context) {
    throw new Error("useDispatch must be used within an AppProvider");
  }
  return context;
}
