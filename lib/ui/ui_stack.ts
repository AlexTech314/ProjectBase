import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { Nextjs } from 'cdk-nextjs-standalone';
import { CfnOutput } from 'aws-cdk-lib';


interface UIStackProps extends cdk.StackProps {
  vpc: Vpc;
}

export class UIStack extends cdk.NestedStack {
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: UIStackProps) {
    super(scope, id, props);

    const nextjs = new Nextjs(this, 'Nextjs', {
      nextjsPath: './ui',
    });

    new CfnOutput(this, "CloudFrontDistributionDomain", {
      value: nextjs.distribution.distributionDomain,
    });

  }
}
