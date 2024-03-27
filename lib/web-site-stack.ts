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

    const webSiteBucketConstruct = new BucketConstruct(
      this,
      "WebSiteBucketConstruct",
      {
        allowDeleteBucketAndContents: props.allowDeleteBucketAndContents,
      }
    );

    const accessLogBucketConstruct = props.accessLog
      ? new BucketConstruct(this, "AccessLogBucketConstruct", {
          ...props.accessLog,
          allowDeleteBucketAndContents: props.allowDeleteBucketAndContents,
          accessControl: cdk.aws_s3.BucketAccessControl.LOG_DELIVERY_WRITE,
        })
      : undefined;

    new ContentsDeliveryConstruct(this, "ContentsDeliveryConstruct", {
      webSiteBucketConstruct,
      accessLogBucketConstruct,
      hostedZoneConstruct,
      certificateConstruct,
      ...props.contentsDeliveryProperty,
    });
  }
}
