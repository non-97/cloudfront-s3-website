import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { LifecycleRule, AccessLog } from "../../parameter/index";

export interface BucketConstructProps extends AccessLog {
  bucketName?: string;
  lifecycleRules?: LifecycleRule[];
  accessControl?: cdk.aws_s3.BucketAccessControl;
  allowDeleteBucketAndObjects?: boolean;
  s3ServerAccessLogBucketConstruct?: BucketConstruct;
}

export class BucketConstruct extends Construct {
  readonly bucket: cdk.aws_s3.Bucket;

  constructor(scope: Construct, id: string, props?: BucketConstructProps) {
    super(scope, id);

    this.bucket = new cdk.aws_s3.Bucket(this, "Default", {
      bucketName: props?.bucketName,
      encryption: cdk.aws_s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: new cdk.aws_s3.BlockPublicAccess({
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true,
      }),
      enforceSSL: true,
      versioned: false,
      removalPolicy: props?.allowDeleteBucketAndObjects
        ? cdk.RemovalPolicy.DESTROY
        : undefined,
      autoDeleteObjects: props?.allowDeleteBucketAndObjects ? true : undefined,
      accessControl: props?.accessControl,
      serverAccessLogsBucket: props?.s3ServerAccessLogBucketConstruct?.bucket,
      serverAccessLogsPrefix:
        props?.s3ServerAccessLogBucketConstruct?.bucket && props?.logFilePrefix
          ? `${props?.logFilePrefix}/`
          : undefined,
    });

    props?.lifecycleRules?.forEach((lifecycleRule) => {
      this.bucket.addLifecycleRule({
        enabled: true,
        id: lifecycleRule.ruleNameSuffix
          ? `Delete-After-${lifecycleRule.expirationDays}Days-${lifecycleRule.ruleNameSuffix}`
          : `Delete-After-${lifecycleRule.expirationDays}Days`,
        expiration: cdk.Duration.days(lifecycleRule.expirationDays),
        prefix: lifecycleRule.prefix,
        expiredObjectDeleteMarker: false,
        abortIncompleteMultipartUploadAfter:
          lifecycleRule.abortIncompleteMultipartUploadAfter,
      });
    });

    if (!props?.s3ServerAccessLogBucketConstruct) {
      return;
    }
    const cfnBucket = this.bucket.node.defaultChild as cdk.aws_s3.CfnBucket;
    cfnBucket.addPropertyOverride(
      "LoggingConfiguration.TargetObjectKeyFormat.PartitionedPrefix.PartitionDateSource",
      "EventTime"
    );
  }
}
