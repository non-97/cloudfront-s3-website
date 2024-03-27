import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { HostZoneProperty } from "../../parameter/index";

export interface HostedZoneConstructProps extends HostZoneProperty {}

export class HostedZoneConstruct extends Construct {
  readonly hostedZone: cdk.aws_route53.IPublicHostedZone;

  constructor(scope: Construct, id: string, props: HostedZoneConstructProps) {
    super(scope, id);

    if (props.zoneName) {
      this.hostedZone = new cdk.aws_route53.PublicHostedZone(this, "Default", {
        zoneName: props.zoneName,
      });
    } else if (props.hostedZoneId) {
      this.hostedZone = cdk.aws_route53.PublicHostedZone.fromHostedZoneId(
        this,
        "Default",
        props.hostedZoneId
      );
    }
  }
}
