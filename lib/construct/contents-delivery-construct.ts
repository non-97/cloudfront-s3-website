import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { ContentsDeliveryProperty, AccessLog } from "../../parameter/index";
import { BucketConstruct } from "./bucket-construct";
import { HostedZoneConstruct } from "./hosted-zone-construct";
import { CertificateConstruct } from "./certificate-construct";
import * as path from "path";

export interface ContentsDeliveryConstructProps
  extends ContentsDeliveryProperty,
    AccessLog {
  webSiteBucketConstruct: BucketConstruct;
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
    const directoryIndexCF2 = props.enableDirectoryIndex
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
        origin: new cdk.aws_cloudfront_origins.S3Origin(
          props.webSiteBucketConstruct.bucket
        ),
        allowedMethods: cdk.aws_cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cdk.aws_cloudfront.CachedMethods.CACHE_GET_HEAD,
        cachePolicy: cdk.aws_cloudfront.CachePolicy.CACHING_DISABLED,
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

    // OAC
    const cfnOriginAccessControl =
      new cdk.aws_cloudfront.CfnOriginAccessControl(
        this,
        "OriginAccessControl",
        {
          originAccessControlConfig: {
            name: "Origin Access Control for Website Bucket",
            originAccessControlOriginType: "s3",
            signingBehavior: "always",
            signingProtocol: "sigv4",
          },
        }
      );

    const cfnDistribution = this.distribution.node
      .defaultChild as cdk.aws_cloudfront.CfnDistribution;

    // Set OAC
    cfnDistribution.addPropertyOverride(
      "DistributionConfig.Origins.0.OriginAccessControlId",
      cfnOriginAccessControl.attrId
    );

    // Set S3 domain name
    cfnDistribution.addPropertyOverride(
      "DistributionConfig.Origins.0.DomainName",
      props.webSiteBucketConstruct.bucket.bucketRegionalDomainName
    );

    // Delete OAI
    cfnDistribution.addPropertyOverride(
      "DistributionConfig.Origins.0.S3OriginConfig.OriginAccessIdentity",
      ""
    );

    // Bucket policy
    props.webSiteBucketConstruct.bucket.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ["s3:GetObject"],
        effect: cdk.aws_iam.Effect.ALLOW,
        principals: [
          new cdk.aws_iam.ServicePrincipal("cloudfront.amazonaws.com"),
        ],
        resources: [`${props.webSiteBucketConstruct.bucket.bucketArn}/*`],
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
      new cdk.aws_route53.ARecord(this, `RRset`, {
        recordName: props.domainName,
        zone: props.hostedZoneConstruct.hostedZone,
        target: cdk.aws_route53.RecordTarget.fromAlias(
          new cdk.aws_route53_targets.CloudFrontTarget(this.distribution)
        ),
      });
    }

    // Deploy contents
    if (!props.contentsPath) {
      return;
    }
    new cdk.aws_s3_deployment.BucketDeployment(this, "ContentsDeploy", {
      sources: [cdk.aws_s3_deployment.Source.asset(props.contentsPath)],
      destinationBucket: props.webSiteBucketConstruct.bucket,
      distribution: this.distribution,
      distributionPaths: ["/*"],
    });
  }
}
