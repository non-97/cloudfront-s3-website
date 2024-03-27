import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { ContentsDeliveryProperty } from "../../parameter/index";
import { BucketConstruct } from "./bucket-construct";
import { HostedZoneConstruct } from "./hosted-zone-construct";
import { CertificateConstruct } from "./certificate-construct";
import * as path from "path";

export interface ContentsDeliveryConstructProps
  extends ContentsDeliveryProperty {
  webSiteBucketConstruct: BucketConstruct;
  accessLogBucketConstruct?: BucketConstruct;
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

    // OAI
    const originAccessIdentity = new cdk.aws_cloudfront.OriginAccessIdentity(
      this,
      "OriginAccessIdentity"
    );
    props.webSiteBucketConstruct.bucket.grantRead(originAccessIdentity);

    // CloudFront Function
    const directoryIndexCF2 = new cdk.aws_cloudfront.Function(
      this,
      "DirectoryIndexCF2",
      {
        code: cdk.aws_cloudfront.FunctionCode.fromFile({
          filePath: path.join(__dirname, "../src/cf2/directory-index/index.js"),
        }),
        runtime: cdk.aws_cloudfront.FunctionRuntime.JS_2_0,
      }
    );

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
          props.webSiteBucketConstruct.bucket,
          {
            originAccessIdentity,
          }
        ),
        allowedMethods: cdk.aws_cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cdk.aws_cloudfront.CachedMethods.CACHE_GET_HEAD,
        cachePolicy: cdk.aws_cloudfront.CachePolicy.CACHING_OPTIMIZED,
        viewerProtocolPolicy:
          cdk.aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy:
          cdk.aws_cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        functionAssociations: [
          {
            function: directoryIndexCF2,
            eventType: cdk.aws_cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      httpVersion: cdk.aws_cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cdk.aws_cloudfront.PriceClass.PRICE_CLASS_ALL,
      domainNames: props.domainName ? [props.domainName] : undefined,
      certificate: props.domainName
        ? props.certificateConstruct?.certificate
        : undefined,
      logBucket: props.accessLogBucketConstruct?.bucket,
    });

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
