c
#include <stdio.h>
#include "ipaship.h"

#ifdef __cplusplus
extern "C" {
#endif

void audit_ipa(const char* file_path, const char* api_key) {
    /* Use both parameters to avoid unused‑parameter warnings */
    printf("Auditing %s via ipaship.com with key %s...\n", file_path, api_key);
}

#ifdef __cplusplus
}
#endif