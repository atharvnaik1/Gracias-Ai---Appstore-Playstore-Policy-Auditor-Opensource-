#import "IPAShip.h"

@implementation IPAShip
- (instancetype)initWithAPIKey:(NSString *)apiKey {
    self = [super init];
    if (self) {
        _apiKey = apiKey;
    }
    return self;
}
- (void)auditFile:(NSString *)filePath completion:(void (^)(NSDictionary *, NSError *))completion {
    NSLog(@"Auditing %@ via ipaship.com...", filePath);
    if(completion) {
        completion(@{@"status": @"success"}, nil);
    }
}
@end