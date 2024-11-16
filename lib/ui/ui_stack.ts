import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Vpc } from 'aws-cdk-lib/aws-ec2';


interface UIStackProps extends cdk.StackProps {
  vpc: Vpc;
}

export class UIStack extends cdk.NestedStack {
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: UIStackProps) {
    super(scope, id, props);

  }
}
