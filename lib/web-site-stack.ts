import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { WebSiteProperty } from "../parameter/index";
import { HostedZoneConstruct } from "./construct/hosted-zone-construct";
import { CertificateConstruct } from "./construct/certificate-construct";
import { BucketConstruct } from "./construct/bucket-construct";
import { ContentsDeliveryConstruct as ContentsDeliveryConstruct } from "./construct/contents-delivery-construct";

export interface WebSiteStackProps extends cdk.StackProps, WebSiteProperty {}

export class WebSiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: WebSiteStackProps) {
    super(scope, id, props);

    // Public Hosted Zone
    const hostedZoneConstruct = props.hostedZone
      ? new HostedZoneConstruct(this, "HostedZoneConstruct", {
          ...props.hostedZone,
        })
      : undefined;

    // ACM Certificate
    const certificateConstruct = props.certificate
      ? new CertificateConstruct(this, "CertificateConstruct", {
          ...props.certificate,
          hostedZoneConstruct,
        })
      : undefined;

    // Bucket for S3 Server Access Log
    const s3serverAccessLogBucketConstruct = props.s3ServerAccessLog
      ? new BucketConstruct(this, "S3ServerAccessLogBucketConstruct", {
          allowDeleteBucketAndObjects: props.allowDeleteBucketAndObjects,
          accessControl: cdk.aws_s3.BucketAccessControl.LOG_DELIVERY_WRITE,
          ...props.s3ServerAccessLog,
        })
      : undefined;

    // Bucket for CloudFront Access Log
    const cloudFrontAccessLogBucketConstruct = props.cloudFrontAccessLog
      ? new BucketConstruct(this, "CloudFrontAccessLogBucketConstruct", {
          allowDeleteBucketAndObjects: props.allowDeleteBucketAndObjects,
          accessControl: cdk.aws_s3.BucketAccessControl.LOG_DELIVERY_WRITE,
          ...props.cloudFrontAccessLog,
        })
      : undefined;

    // Bucket for Website contents
    const webSiteBucketConstruct = new BucketConstruct(
      this,
      "WebSiteBucketConstruct",
      {
        s3ServerAccessLogBucketConstruct: s3serverAccessLogBucketConstruct,
        allowDeleteBucketAndObjects: props.allowDeleteBucketAndObjects,
      }
    );

    // CloudFront
    new ContentsDeliveryConstruct(this, "ContentsDeliveryConstruct", {
      webSiteBucketConstruct,
      cloudFrontAccessLogBucketConstruct,
      hostedZoneConstruct,
      certificateConstruct,
      ...props.contentsDelivery,
      ...props.cloudFrontAccessLog,
    });
  }
}
