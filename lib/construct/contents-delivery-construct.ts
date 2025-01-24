import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  ContentsDeliveryProperty,
  AccessLog,
  LogAnalytics,
} from "../../parameter/index";
import { BucketConstruct } from "./bucket-construct";
import { HostedZoneConstruct } from "./hosted-zone-construct";
import { CertificateConstruct } from "./certificate-construct";
import * as path from "path";

export interface ContentsDeliveryConstructProps
  extends ContentsDeliveryProperty,
    AccessLog,
    LogAnalytics {
  websiteBucketConstruct: BucketConstruct;
  cloudFrontAccessLogBucketConstruct?: BucketConstruct;
  hostedZoneConstruct?: HostedZoneConstruct;
  certificateConstruct?: CertificateConstruct;
}

export class ContentsDeliveryConstruct extends Construct {
  readonly distribution: cdk.aws_cloudfront.Distribution;

  constructor(
    scope: Construct,
    id: string,
    props: ContentsDeliveryConstructProps
  ) {
    super(scope, id);

    // CloudFront Function
    const directoryIndexCF2 =
      props.enableDirectoryIndex === "cf2"
        ? new cdk.aws_cloudfront.Function(this, "DirectoryIndexCF2", {
            code: cdk.aws_cloudfront.FunctionCode.fromFile({
              filePath: path.join(
                __dirname,
                "../src/cf2/directory-index/index.js"
              ),
            }),
            runtime: cdk.aws_cloudfront.FunctionRuntime.JS_2_0,
          })
        : undefined;

    // Lambda@Edge
    const directoryIndexLambdaEdge =
      props.enableDirectoryIndex === "lambdaEdge"
        ? new cdk.aws_lambda_nodejs.NodejsFunction(
            this,
            "DirectoryIndexLambdaEdge",
            {
              entry: path.join(
                __dirname,
                "../src/lambda/directory-index/index.ts"
              ),
              runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
              bundling: {
                minify: true,
                tsconfig: path.join(__dirname, "../src/lambda/tsconfig.json"),
                format: cdk.aws_lambda_nodejs.OutputFormat.ESM,
              },
              awsSdkConnectionReuse: false,
              architecture: cdk.aws_lambda.Architecture.X86_64,
              timeout: cdk.Duration.seconds(5),
              role: new cdk.aws_iam.Role(this, "LambdaEdgeExecutionRole", {
                assumedBy: new cdk.aws_iam.CompositePrincipal(
                  new cdk.aws_iam.ServicePrincipal("lambda.amazonaws.com"),
                  new cdk.aws_iam.ServicePrincipal("edgelambda.amazonaws.com")
                ),
                managedPolicies: [
                  cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
                    "service-role/AWSLambdaBasicExecutionRole"
                  ),
                ],
              }),
            }
          )
        : undefined;

    // CloudFront Distribution
    this.distribution = new cdk.aws_cloudfront.Distribution(this, "Default", {
      defaultRootObject: "index.html",
      errorResponses: [
        {
          ttl: cdk.Duration.minutes(1),
          httpStatus: 403,
          responseHttpStatus: 403,
          responsePagePath: "/error.html",
        },
        {
          ttl: cdk.Duration.minutes(1),
          httpStatus: 404,
          responseHttpStatus: 404,
          responsePagePath: "/error.html",
        },
      ],
      defaultBehavior: {
        origin:
          cdk.aws_cloudfront_origins.S3BucketOrigin.withOriginAccessControl(
            props.websiteBucketConstruct.bucket
          ),
        allowedMethods: cdk.aws_cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cdk.aws_cloudfront.CachedMethods.CACHE_GET_HEAD,
        cachePolicy: cdk.aws_cloudfront.CachePolicy.CACHING_OPTIMIZED,
        viewerProtocolPolicy:
          cdk.aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy:
          cdk.aws_cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        functionAssociations: directoryIndexCF2
          ? [
              {
                function: directoryIndexCF2,
                eventType: cdk.aws_cloudfront.FunctionEventType.VIEWER_REQUEST,
              },
            ]
          : undefined,
        edgeLambdas: directoryIndexLambdaEdge
          ? [
              {
                functionVersion: directoryIndexLambdaEdge.currentVersion,
                eventType:
                  cdk.aws_cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
              },
            ]
          : undefined,
      },
      httpVersion: cdk.aws_cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cdk.aws_cloudfront.PriceClass.PRICE_CLASS_ALL,
      domainNames: props.domainName ? [props.domainName] : undefined,
      certificate: props.domainName
        ? props.certificateConstruct?.certificate
        : undefined,
      logBucket: props.cloudFrontAccessLogBucketConstruct?.bucket,
      logFilePrefix: props.logFilePrefix,
    });

    // Bucket policy
    props.websiteBucketConstruct.bucket.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: props.enableS3ListBucket
          ? ["s3:GetObject", "s3:ListBucket"]
          : ["s3:GetObject"],
        effect: cdk.aws_iam.Effect.ALLOW,
        principals: [
          new cdk.aws_iam.ServicePrincipal("cloudfront.amazonaws.com"),
        ],
        resources: props.enableS3ListBucket
          ? [
              `${props.websiteBucketConstruct.bucket.bucketArn}/*`,
              props.websiteBucketConstruct.bucket.bucketArn,
            ]
          : [`${props.websiteBucketConstruct.bucket.bucketArn}/*`],
        conditions: {
          StringEquals: {
            "AWS:SourceArn": `arn:aws:cloudfront::${
              cdk.Stack.of(this).account
            }:distribution/${this.distribution.distributionId}`,
          },
        },
      })
    );

    // RRset
    if (props.hostedZoneConstruct) {
      new cdk.aws_route53.ARecord(this, `AliasRecord`, {
        recordName: props.domainName,
        zone: props.hostedZoneConstruct.hostedZone,
        target: cdk.aws_route53.RecordTarget.fromAlias(
          new cdk.aws_route53_targets.CloudFrontTarget(this.distribution)
        ),
      });
    }

    if (
      props.cloudFrontAccessLogBucketConstruct &&
      props.enableLogAnalytics?.find((enableLogAnalytics) => {
        return enableLogAnalytics === "cloudFrontAccessLog";
      })
    ) {
      const targetKeyPrefix = props.logFilePrefix
        ? `${props.logFilePrefix}/partitioned/${cdk.Stack.of(this).account}/${
            this.distribution.distributionId
          }/`
        : `partitioned/${cdk.Stack.of(this).account}/${
            this.distribution.distributionId
          }/`;

      const moveCloudFrontAccessLogLambda =
        new cdk.aws_lambda_nodejs.NodejsFunction(
          this,
          "MoveCloudFrontAccessLogLambda",
          {
            entry: path.join(
              __dirname,
              "../src/lambda/move-cloudfront-access-log/index.ts"
            ),
            runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
            bundling: {
              minify: true,
              tsconfig: path.join(__dirname, "../src/lambda/tsconfig.json"),
              format: cdk.aws_lambda_nodejs.OutputFormat.ESM,
            },
            architecture: cdk.aws_lambda.Architecture.ARM_64,
            environment: {
              TARGET_KEY_PREFIX: targetKeyPrefix,
              HIVE_COMPATIBLE_PARTITIONS: "false",
            },
          }
        );

      props.cloudFrontAccessLogBucketConstruct.bucket.enableEventBridgeNotification();
      props.cloudFrontAccessLogBucketConstruct.bucket.grantReadWrite(
        moveCloudFrontAccessLogLambda
      );
      props.cloudFrontAccessLogBucketConstruct.bucket.grantDelete(
        moveCloudFrontAccessLogLambda
      );

      new cdk.aws_events.Rule(this, "CloudFrontAccessLogCreatedEventRule", {
        eventPattern: {
          source: ["aws.s3"],
          resources: [
            props.cloudFrontAccessLogBucketConstruct.bucket.bucketArn,
          ],
          detailType: ["Object Created"],
          detail: {
            object: {
              key: [
                {
                  "anything-but": {
                    prefix: targetKeyPrefix,
                  },
                },
              ],
            },
          },
        },
        targets: [
          new cdk.aws_events_targets.LambdaFunction(
            moveCloudFrontAccessLogLambda
          ),
        ],
      });
    }

    // Deploy contents
    if (!props.contentsPath) {
      return;
    }
    new cdk.aws_s3_deployment.BucketDeployment(this, "DeployContents", {
      sources: [cdk.aws_s3_deployment.Source.asset(props.contentsPath)],
      destinationBucket: props.websiteBucketConstruct.bucket,
      distribution: this.distribution,
      distributionPaths: ["/*"],
    });
  }
}
