import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { LifecycleRule, AccessLog } from "../../parameter/index";

export interface BucketConstructProps extends AccessLog {
  bucketName?: string;
  lifecycleRules?: LifecycleRule[];
  accessControl?: cdk.aws_s3.BucketAccessControl;
  allowDeleteBucketAndContents?: boolean;
  s3serverAccessLogBucketConstruct?: BucketConstruct;
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
      removalPolicy: props?.allowDeleteBucketAndContents
        ? cdk.RemovalPolicy.DESTROY
        : undefined,
      autoDeleteObjects: props?.allowDeleteBucketAndContents ? true : undefined,
      accessControl: props?.accessControl,
      serverAccessLogsBucket: props?.s3serverAccessLogBucketConstruct?.bucket,
      serverAccessLogsPrefix: props?.logFilePrefix,
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

    if (!props?.s3serverAccessLogBucketConstruct) {
      return;
    }
    const cfnBucket = this.bucket.node.defaultChild as cdk.aws_s3.CfnBucket;
    cfnBucket.addPropertyOverride(
      "LoggingConfiguration.TargetObjectKeyFormat.PartitionedPrefix.PartitionDateSource",
      "EventTime"
    );
  }
}
