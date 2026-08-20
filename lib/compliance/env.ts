/** Any environment-shaped record. Looser than NodeJS.ProcessEnv so tests can pass literals. */
export type EnvLike = Record<string, string | undefined>
