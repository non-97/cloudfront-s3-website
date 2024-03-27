import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { CertificateProperty } from "../../parameter/index";
import { HostedZoneConstruct } from "./hosted-zone-construct";

export interface CertificateConstructProps extends CertificateProperty {
  hostedZoneConstruct?: HostedZoneConstruct;
}

export class CertificateConstruct extends Construct {
  readonly certificate: cdk.aws_certificatemanager.ICertificate;

  constructor(scope: Construct, id: string, props: CertificateConstructProps) {
    super(scope, id);

    if (props.certificateArn) {
      this.certificate =
        cdk.aws_certificatemanager.Certificate.fromCertificateArn(
          this,
          "Default",
          props.certificateArn
        );
    } else if (props.certificateDomainName) {
      this.certificate = new cdk.aws_certificatemanager.Certificate(
        this,
        "Certificate",
        {
          domainName: props.certificateDomainName,
          validation: cdk.aws_certificatemanager.CertificateValidation.fromDns(
            props.hostedZoneConstruct?.hostedZone
          ),
        }
      );
    }
  }
}
