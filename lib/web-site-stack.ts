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

    const hostedZoneConstruct = props.hostedZone
      ? new HostedZoneConstruct(this, "HostedZoneConstruct", {
          ...props.hostedZone,
        })
      : undefined;

    const certificateConstruct = props.certificate
      ? new CertificateConstruct(this, "CertificateConstruct", {
          ...props.certificate,
          hostedZoneConstruct,
        })
      : undefined;

    const s3serverAccessLogBucketConstruct = props.s3ServerAccessLog
      ? new BucketConstruct(this, "S3ServerAccessLogBucketConstruct", {
          allowDeleteBucketAndContents: props.allowDeleteBucketAndContents,
          accessControl: cdk.aws_s3.BucketAccessControl.LOG_DELIVERY_WRITE,
          ...props.s3ServerAccessLog,
        })
      : undefined;

    const cloudFrontAccessLogBucketConstruct = props.cloudFrontAccessLog
      ? new BucketConstruct(this, "CloudFrontAccessLogBucketConstruct", {
          allowDeleteBucketAndContents: props.allowDeleteBucketAndContents,
          accessControl: cdk.aws_s3.BucketAccessControl.LOG_DELIVERY_WRITE,
          ...props.cloudFrontAccessLog,
        })
      : undefined;

    const webSiteBucketConstruct = new BucketConstruct(
      this,
      "WebSiteBucketConstruct",
      {
        s3serverAccessLogBucketConstruct,
        allowDeleteBucketAndContents: props.allowDeleteBucketAndContents,
        ...props.s3ServerAccessLog,
      }
    );

    new ContentsDeliveryConstruct(this, "ContentsDeliveryConstruct", {
      webSiteBucketConstruct,
      cloudFrontAccessLogBucketConstruct,
      hostedZoneConstruct,
      certificateConstruct,
      ...props.contentsDeliveryProperty,
      ...props.cloudFrontAccessLog,
    });
  }
}
