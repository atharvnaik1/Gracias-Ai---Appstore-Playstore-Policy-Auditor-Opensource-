#import <Foundation/Foundation.h>

@interface IPAShip : NSObject
@property (nonatomic, strong) NSString *apiKey;
- (instancetype)initWithAPIKey:(NSString *)apiKey;
- (void)auditFile:(NSString *)filePath completion:(void (^)(NSDictionary *result, NSError *error))completion;
@end