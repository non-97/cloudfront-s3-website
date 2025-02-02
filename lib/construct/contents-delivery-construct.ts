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
  readonly distribution: cdk.aws_cloudfront.IDistribution;
  private readonly s3Origin: cdk.aws_cloudfront.IOrigin;

  constructor(
    scope: Construct,
    id: string,
    props: ContentsDeliveryConstructProps
  ) {
    super(scope, id);

    const cloudFrontFunctions = this.createCF2(props);
    const lambdaEdgeFunctions = this.createLambdaEdgeFunctions(props);

    this.s3Origin =
      cdk.aws_cloudfront_origins.S3BucketOrigin.withOriginAccessControl(
        props.websiteBucketConstruct.bucket
      );

    this.distribution = this.createDistribution(props, {
      ...cloudFrontFunctions,
      ...lambdaEdgeFunctions,
    });

    this.configureBucketPolicy(props);
    this.configureRoute53Records(props);
    this.configureLogAnalytics(props);
    this.deployContents(props);
  }

  private createCF2(props: ContentsDeliveryConstructProps) {
    return {
      directoryIndexCF2:
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
          : undefined,
      rewriteToWebpCF2:
        props.enableRewriteToWebp === "cf2"
          ? new cdk.aws_cloudfront.Function(this, "RewriteToWebpCF2", {
              code: cdk.aws_cloudfront.FunctionCode.fromFile({
                filePath: path.join(
                  __dirname,
                  "../src/cf2/rewrite-to-webp/index.js"
                ),
              }),
              runtime: cdk.aws_cloudfront.FunctionRuntime.JS_2_0,
            })
          : undefined,
      normalizeWebpCacheKeyCF2:
        props.enableRewriteToWebp === "cf2LambdaEdge"
          ? new cdk.aws_cloudfront.Function(this, "NormalizeWebpCacheKeyCF2", {
              code: cdk.aws_cloudfront.FunctionCode.fromFile({
                filePath: path.join(
                  __dirname,
                  "../src/cf2/normalize-webp-cache-key/index.js"
                ),
              }),
              runtime: cdk.aws_cloudfront.FunctionRuntime.JS_2_0,
            })
          : undefined,
    };
  }

  private createLambdaEdgeFunctions(props: ContentsDeliveryConstructProps) {
    // Early return if no Lambda@Edge functions are enabled
    if (!this.isLambdaEdgeEnabled(props)) {
      return {};
    }

    return {
      directoryIndexLambdaEdge: this.createLambdaEdgeFunction({
        functionName: "DirectoryIndexLambdaEdge",
        entry: "../src/lambda/directory-index/index.ts",
        enabled: props.enableDirectoryIndex === "lambdaEdge",
      }),
      rewriteToWebpLambdaEdge: this.createLambdaEdgeFunction({
        functionName: "RewriteToWebpLambdaEdge",
        entry: "../src/lambda/rewrite-to-webp/index.ts",
        enabled:
          props.enableRewriteToWebp === "lambdaEdge" ||
          props.enableRewriteToWebp === "cf2LambdaEdge",
        additionalPermissions: (role) =>
          this.configureRewriteToWebpPermissions(props, role),
      }),
    };
  }

  private isLambdaEdgeEnabled(props: ContentsDeliveryConstructProps): boolean {
    return (
      props.enableDirectoryIndex === "lambdaEdge" ||
      props.enableRewriteToWebp === "lambdaEdge" ||
      props.enableRewriteToWebp === "cf2LambdaEdge"
    );
  }

  private createLambdaEdgeFunction({
    functionName,
    entry,
    enabled,
    additionalPermissions,
  }: {
    functionName: string;
    entry: string;
    enabled: boolean;
    additionalPermissions?: (role: cdk.aws_iam.Role) => void;
  }): cdk.aws_lambda_nodejs.NodejsFunction | undefined {
    if (!enabled) {
      return undefined;
    }

    const role = new cdk.aws_iam.Role(this, `${functionName}Role`, {
      assumedBy: new cdk.aws_iam.CompositePrincipal(
        new cdk.aws_iam.ServicePrincipal("lambda.amazonaws.com"),
        new cdk.aws_iam.ServicePrincipal("edgelambda.amazonaws.com")
      ),
      managedPolicies: [
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
      ],
    });

    // Apply additional permissions if specified
    if (additionalPermissions) {
      additionalPermissions(role);
    }

    return new cdk.aws_lambda_nodejs.NodejsFunction(this, functionName, {
      runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
      bundling: {
        minify: true,
        tsconfig: path.join(__dirname, "../src/lambda/tsconfig.json"),
        format: cdk.aws_lambda_nodejs.OutputFormat.ESM,
      },
      awsSdkConnectionReuse: false,
      architecture: cdk.aws_lambda.Architecture.X86_64,
      timeout: cdk.Duration.seconds(5),
      role: role,
      entry: path.join(__dirname, entry),
    });
  }

  private configureRewriteToWebpPermissions(
    props: ContentsDeliveryConstructProps,
    role: cdk.aws_iam.Role
  ): void {
    role.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ["s3:GetObject", "s3:ListBucket"],
        resources: [
          `${props.websiteBucketConstruct.bucket.bucketArn}/*`,
          props.websiteBucketConstruct.bucket.bucketArn,
        ],
      })
    );
  }

  private createDistribution(
    props: ContentsDeliveryConstructProps,
    functions: ReturnType<typeof this.createCF2> &
      ReturnType<typeof this.createLambdaEdgeFunctions>
  ) {
    const distribution = new cdk.aws_cloudfront.Distribution(this, "Default", {
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
      defaultBehavior: this.getDefaultBehavior(functions),
      httpVersion: cdk.aws_cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cdk.aws_cloudfront.PriceClass.PRICE_CLASS_ALL,
      domainNames: props.domainName ? [props.domainName] : undefined,
      certificate: props.domainName
        ? props.certificateConstruct?.certificate
        : undefined,
      logBucket: props.cloudFrontAccessLogBucketConstruct?.bucket,
      logFilePrefix: props.logFilePrefix,
    });

    this.addImageBehaviors(distribution, functions);

    return distribution;
  }

  private getDefaultBehavior(
    functions: ReturnType<typeof this.createCF2> &
      ReturnType<typeof this.createLambdaEdgeFunctions>
  ): cdk.aws_cloudfront.BehaviorOptions {
    return {
      origin: this.s3Origin,
      allowedMethods: cdk.aws_cloudfront.AllowedMethods.ALLOW_GET_HEAD,
      cachedMethods: cdk.aws_cloudfront.CachedMethods.CACHE_GET_HEAD,
      cachePolicy: cdk.aws_cloudfront.CachePolicy.CACHING_OPTIMIZED,
      viewerProtocolPolicy:
        cdk.aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      responseHeadersPolicy:
        cdk.aws_cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      functionAssociations: functions.directoryIndexCF2
        ? [
            {
              function: functions.directoryIndexCF2,
              eventType: cdk.aws_cloudfront.FunctionEventType.VIEWER_REQUEST,
            },
          ]
        : undefined,
      edgeLambdas: functions.directoryIndexLambdaEdge
        ? [
            {
              functionVersion:
                functions.directoryIndexLambdaEdge.currentVersion,
              eventType: cdk.aws_cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
            },
          ]
        : undefined,
    };
  }

  private createAcceptCachePolicy() {
    return new cdk.aws_cloudfront.CachePolicy(this, "AcceptCachePolicy", {
      defaultTtl: cdk.Duration.days(1),
      minTtl: cdk.Duration.seconds(1),
      maxTtl: cdk.Duration.days(7),
      cookieBehavior: cdk.aws_cloudfront.CacheCookieBehavior.none(),
      headerBehavior:
        cdk.aws_cloudfront.CacheHeaderBehavior.allowList("Accept"),
      queryStringBehavior: cdk.aws_cloudfront.CacheQueryStringBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });
  }

  private createViewerAcceptWebpCachePolicy() {
    return new cdk.aws_cloudfront.CachePolicy(
      this,
      "ViewerAcceptWebpCachePolicy",
      {
        defaultTtl: cdk.Duration.days(1),
        minTtl: cdk.Duration.seconds(1),
        maxTtl: cdk.Duration.days(7),
        cookieBehavior: cdk.aws_cloudfront.CacheCookieBehavior.none(),
        headerBehavior: cdk.aws_cloudfront.CacheHeaderBehavior.allowList(
          "x-viewer-accept-webp"
        ),
        queryStringBehavior: cdk.aws_cloudfront.CacheQueryStringBehavior.none(),
        enableAcceptEncodingGzip: true,
        enableAcceptEncodingBrotli: true,
      }
    );
  }

  private getImageBehaviorOptions(
    functions: ReturnType<typeof this.createCF2> &
      ReturnType<typeof this.createLambdaEdgeFunctions>
  ): cdk.aws_cloudfront.AddBehaviorOptions {
    return {
      allowedMethods: cdk.aws_cloudfront.AllowedMethods.ALLOW_GET_HEAD,
      cachedMethods: cdk.aws_cloudfront.CachedMethods.CACHE_GET_HEAD,
      cachePolicy: functions.rewriteToWebpCF2
        ? this.createAcceptCachePolicy()
        : functions.normalizeWebpCacheKeyCF2
        ? this.createViewerAcceptWebpCachePolicy()
        : cdk.aws_cloudfront.CachePolicy.CACHING_OPTIMIZED,
      originRequestPolicy:
        cdk.aws_cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      viewerProtocolPolicy:
        cdk.aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      responseHeadersPolicy:
        cdk.aws_cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      functionAssociations: functions.rewriteToWebpCF2
        ? [
            {
              function: functions.rewriteToWebpCF2,
              eventType: cdk.aws_cloudfront.FunctionEventType.VIEWER_REQUEST,
            },
          ]
        : functions.normalizeWebpCacheKeyCF2
        ? [
            {
              function: functions.normalizeWebpCacheKeyCF2,
              eventType: cdk.aws_cloudfront.FunctionEventType.VIEWER_REQUEST,
            },
          ]
        : undefined,
      edgeLambdas: functions.rewriteToWebpLambdaEdge
        ? [
            {
              functionVersion: functions.rewriteToWebpLambdaEdge.currentVersion,
              eventType: cdk.aws_cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
            },
          ]
        : undefined,
    };
  }

  private addImageBehaviors(
    distribution: cdk.aws_cloudfront.Distribution,
    functions: ReturnType<typeof this.createCF2> &
      ReturnType<typeof this.createLambdaEdgeFunctions>
  ) {
    const behaviorOptions = this.getImageBehaviorOptions(functions);

    distribution.addBehavior("/*.jpe?g", this.s3Origin, behaviorOptions);
    distribution.addBehavior("/*.png", this.s3Origin, behaviorOptions);
  }

  private configureBucketPolicy(props: ContentsDeliveryConstructProps) {
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
  }

  private configureRoute53Records(props: ContentsDeliveryConstructProps) {
    if (props.hostedZoneConstruct && props.domainName) {
      new cdk.aws_route53.ARecord(this, `AliasRecord`, {
        recordName: props.domainName,
        zone: props.hostedZoneConstruct.hostedZone,
        target: cdk.aws_route53.RecordTarget.fromAlias(
          new cdk.aws_route53_targets.CloudFrontTarget(this.distribution)
        ),
      });
    }
  }

  private configureLogAnalytics(props: ContentsDeliveryConstructProps) {
    if (
      !props.enableLogAnalytics?.length ||
      !props.cloudFrontAccessLogBucketConstruct
    ) {
      return;
    }

    // CloudFront Standard Log Legacy
    if (props.enableLogAnalytics.includes("cloudFrontStandardLogLegacy")) {
      const targetKeyPrefix = props.logFilePrefix
        ? `${props.logFilePrefix}/partitioned/${cdk.Stack.of(this).account}/${
            this.distribution.distributionId
          }/`
        : `partitioned/${cdk.Stack.of(this).account}/${
            this.distribution.distributionId
          }/`;
      const moveLogLambda = this.createMoveLogLambda(targetKeyPrefix);

      this.configureMoveLogLambdaPermissions(props, moveLogLambda);
      this.createLogEventRule(props, targetKeyPrefix, moveLogLambda);
    }

    // CloudFront Standard Log V2
    if (props.enableLogAnalytics.includes("cloudFrontStandardLogV2")) {
      // Remove CloudFront Standard Log Legacy
      const cfnDistribution = this.distribution.node
        .defaultChild as cdk.aws_cloudfront.CfnDistribution;
      cfnDistribution.addPropertyDeletionOverride("DistributionConfig.Logging");

      props.cloudFrontAccessLogBucketConstruct.bucket.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          actions: ["s3:PutObject"],
          effect: cdk.aws_iam.Effect.ALLOW,
          principals: [
            new cdk.aws_iam.ServicePrincipal("delivery.logs.amazonaws.com"),
          ],
          resources: [
            `${
              props.cloudFrontAccessLogBucketConstruct.bucket.bucketArn
            }/AWSLogs/${cdk.Stack.of(this).account}/CloudFront/*`,
          ],
          conditions: {
            StringEquals: {
              "s3:x-amz-acl": "bucket-owner-full-control",
              "aws:SourceAccount": cdk.Stack.of(this).account,
            },
            ArnLike: {
              "aws:SourceArn": `arn:aws:logs:${cdk.Stack.of(this).region}:${
                cdk.Stack.of(this).account
              }:delivery-source:cf-${this.distribution.distributionId}`,
            },
          },
        })
      );

      const cloudFrontStandardLogDeliverySourceName = `cf-${this.distribution.distributionId}`;
      const cloudFrontStandardLogDeliveryDestinationName = `cf-${this.distribution.distributionId}-s3`;
      const logPrefix = this.getStandardLogV2Prefix(props.logFilePrefix);

      const cloudFrontStandardLogDeliverySource =
        new cdk.aws_logs.CfnDeliverySource(
          this,
          "CloudFrontStandardLogDeliverySource",
          {
            name: cloudFrontStandardLogDeliverySourceName,
            resourceArn: this.distribution.distributionArn,
            logType: "ACCESS_LOGS",
          }
        );

      const cloudFrontStandardLogDeliveryDestination =
        new cdk.aws_logs.CfnDeliveryDestination(
          this,
          "CloudFrontStandardLogDeliveryDestination",
          {
            name: cloudFrontStandardLogDeliveryDestinationName,
            outputFormat: "parquet",
            destinationResourceArn: `${props.cloudFrontAccessLogBucketConstruct.bucket.bucketArn}/AWSLogs`,
          }
        );

      new cdk.aws_logs.CfnDelivery(this, "CloudFrontStandardLogDelivery", {
        deliverySourceName: cloudFrontStandardLogDeliverySource.name,
        deliveryDestinationArn:
          cloudFrontStandardLogDeliveryDestination.attrArn,
        s3EnableHiveCompatiblePath: false,
        s3SuffixPath: logPrefix,
      });
    }
  }

  private createMoveLogLambda(targetKeyPrefix: string) {
    return new cdk.aws_lambda_nodejs.NodejsFunction(
      this,
      "MoveCloudFrontAccessLogLambda",
      {
        entry: path.join(
          __dirname,
          "../src/lambda/move-cloudfront-access-log/index.ts"
        ),
        runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
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
  }

  /**
   * Format log object prefix with AWS Logs prefix
   */
  private getStandardLogV2Prefix(logObjectPrefix: string | undefined): string {
    const LOG_OBJECT_PATH = `${
      cdk.Stack.of(this).account
    }/CloudFront/{DistributionId}/{yyyy}/{MM}/{dd}/{HH}`;

    return logObjectPrefix
      ? `${logObjectPrefix}/${LOG_OBJECT_PATH}`
      : LOG_OBJECT_PATH;
  }

  private configureMoveLogLambdaPermissions(
    props: ContentsDeliveryConstructProps,
    lambda: cdk.aws_lambda_nodejs.NodejsFunction
  ) {
    const bucket = props.cloudFrontAccessLogBucketConstruct!.bucket;
    bucket.enableEventBridgeNotification();
    bucket.grantReadWrite(lambda);
    bucket.grantDelete(lambda);
  }

  private createLogEventRule(
    props: ContentsDeliveryConstructProps,
    targetKeyPrefix: string,
    lambda: cdk.aws_lambda_nodejs.NodejsFunction
  ) {
    new cdk.aws_events.Rule(this, "CloudFrontAccessLogCreatedEventRule", {
      eventPattern: {
        source: ["aws.s3"],
        resources: [props.cloudFrontAccessLogBucketConstruct!.bucket.bucketArn],
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
      targets: [new cdk.aws_events_targets.LambdaFunction(lambda)],
    });
  }

  private deployContents(props: ContentsDeliveryConstructProps) {
    if (!props.contentsPath) {
      return;
    }

    const asset = cdk.aws_s3_deployment.Source.asset(props.contentsPath, {
      exclude: [".DS_Store"],
    });

    // Deploy non-WebP contents
    new cdk.aws_s3_deployment.BucketDeployment(this, "DeployContents", {
      sources: [asset],
      destinationBucket: props.websiteBucketConstruct.bucket,
      exclude: ["*.webp"],
      distribution: this.distribution,
      distributionPaths: ["/*"],
    });

    // Deploy WebP contents
    new cdk.aws_s3_deployment.BucketDeployment(this, "DeployContentsWebP", {
      sources: [asset],
      destinationBucket: props.websiteBucketConstruct.bucket,
      exclude: ["*"],
      include: ["*.webp"],
      distribution: this.distribution,
      distributionPaths: ["/*"],
      contentType: "image/webp",
    });
  }
}
