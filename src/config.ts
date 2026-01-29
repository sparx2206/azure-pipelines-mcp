import { z } from "zod";

/**
 * Konfigurace aplikace.
 */
export interface Config {
	azureDevOps: {
		org: string;
		pat: string;
		project?: string;
	};
}

/**
 * Zod schéma pro validaci env proměnných.
 */
const envSchema = z.object({
	AZURE_DEVOPS_ORG: z
		.string()
		.min(1, "AZURE_DEVOPS_ORG environment variable is required"),
	AZURE_DEVOPS_PAT: z
		.string()
		.min(1, "AZURE_DEVOPS_PAT environment variable is required"),
	AZURE_DEVOPS_PROJECT: z.string().optional(),
});

/**
 * Načte a validuje konfiguraci z environment variables.
 * @throws {z.ZodError} Pokud konfigurace není validní.
 */
export function loadConfig(): Config {
	const env = envSchema.parse(process.env);

	return {
		azureDevOps: {
			org: env.AZURE_DEVOPS_ORG,
			pat: env.AZURE_DEVOPS_PAT,
			project: env.AZURE_DEVOPS_PROJECT,
		},
	};
}
