c
#include <stdio.h>
#include <stdlib.h>
#include "ipaship.h"

#ifdef __cplusplus
extern "C" {
#endif

void audit_ipa(const char* file_path, const char* api_key) {
    /* Retrieve Vercel project identifier from environment variable */
    const char* vercel_project_id = getenv("VERCEL_PROJECT_ID");
    if (!vercel_project_id) {
        fprintf(stderr, "Error: VERCEL_PROJECT_ID environment variable is not set.\n");
        return;
    }

    /* Use both parameters to avoid unused‑parameter warnings */
    printf("Auditing %s via ipaship.com with key %s on Vercel project %s...\n",
           file_path, api_key, vercel_project_id);
}

#ifdef __cplusplus
}
#endif