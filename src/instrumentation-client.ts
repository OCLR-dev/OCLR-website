import { config } from "zod/v4/core";

// Zod probes dynamic code generation when it creates object schemas.
// Disable the probe under the site's nonce-based Content Security Policy.
config({ jitless: true });
