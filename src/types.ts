export type Constraint = { key: string; value: boolean };
export type Variable = {
  name: string;
  required: boolean;
  default: string | null;
};
export type Lesson = {
  purpose: string;
  example: string;
  why: string;
  verify: string;
  limitations: string;
  evidence: string;
  reviewed_at: string;
  level: string;
  area: string;
};
export type Recipe = {
  id: string;
  revision_id: string;
  version: number;
  parent_revision_id: string | null;
  name: string;
  description: string;
  body: string;
  builtin: boolean;
  variables: Variable[];
  constraints: Constraint[];
  lesson: Lesson | null;
  actions?: string[];
  goals?: string[];
};
export type Project = {
  id: string;
  name: string;
  environment: "code" | "chat";
  reference: string;
  assignment: string[];
  version: number;
};
export type Feedback = {
  revision_id: string;
  outcome: string;
  note: string;
  created_at: string;
};
export type RecipeSet = {
  id: string;
  name: string;
  revision_ids: string[];
  version: number;
};
export type Snapshot = {
  sets: RecipeSet[];
  repositories: Record<string, string>;
  recipes: Recipe[];
  projects: Project[];
  active_project: string;
  feedback: Feedback[];
  revisions: { recipe: Recipe; reason: string }[];
  onboarded: boolean;
  ai_target: AiTarget | null;
  ai_catalog: AiCatalog;
};
export type Composition = {
  body: string;
  hash: string;
  revision_ids: string[];
  variables: Variable[];
  diagnostics: { kind: string; message: string; revision_ids: string[] }[];
  blocked: boolean;
};

export type AiTarget = {
  profile_id: string;
  surface: "chat" | "agent";
  task: string;
  format: "markdown" | "xml";
  catalog_version: string;
};
export type AiProfile = {
  id: string;
  name: string;
  plan: string;
  models: string;
  facts: string;
  strength: string;
  caution: string;
  chat: string;
  agent: string;
  format: "markdown" | "xml";
  sources: string[];
};
export type AiTask = {
  id: string;
  name: string;
  recipe_ids: string[];
  guidance: string;
  instruction: string;
};
export type AiCatalog = {
  schema_version: number;
  version: string;
  checked_at: string;
  review_due: string;
  status: string;
  profiles: AiProfile[];
  tasks: AiTask[];
  sources: { id: string; title: string; url: string }[];
};
