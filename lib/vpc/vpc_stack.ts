import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export class VPCStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create the VPC with public, private (with NAT), and isolated (private without NAT) subnets
    this.vpc = new ec2.Vpc(this, `${id}-VPC`, {
      maxAzs: 3, // Number of Availability Zones to use
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'PublicSubnet',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'PrivateSubnet',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: 'IsolatedSubnet',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
      natGateways: 1, // Number of NAT Gateways to create
    });

    // Output the VPC ID for cross-stack references
    new cdk.CfnOutput(this, 'VPCId', {
      value: this.vpc.vpcId,
      exportName: `${this.stackName}:VPCId`,
    });

    // Get subnet selections
    const publicSubnets = this.vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC }).subnets;
    const privateSubnets = this.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnets;
    const isolatedSubnets = this.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }).subnets;

    // Create NACLs
    const privateNacl = new ec2.NetworkAcl(this, 'PrivateSubnetNACL', {
      vpc: this.vpc,
      subnetSelection: { subnets: privateSubnets },
    });

    const isolatedNacl = new ec2.NetworkAcl(this, 'IsolatedSubnetNACL', {
      vpc: this.vpc,
      subnetSelection: { subnets: isolatedSubnets },
    });

    // Get CIDR blocks
    const publicSubnetCidrs = publicSubnets.map(subnet => subnet.ipv4CidrBlock);
    const privateSubnetCidrs = privateSubnets.map(subnet => subnet.ipv4CidrBlock);
    const isolatedSubnetCidrs = isolatedSubnets.map(subnet => subnet.ipv4CidrBlock);

    // Configure Private Subnet NACL
    // Allow inbound traffic from Public Subnets
    publicSubnetCidrs.forEach((cidr, index) => {
      privateNacl.addEntry(`AllowPublicInbound${index}`, {
        ruleNumber: 100 + index,
        cidr: ec2.AclCidr.ipv4(cidr),
        traffic: ec2.AclTraffic.allTraffic(),
        direction: ec2.TrafficDirection.INGRESS,
        ruleAction: ec2.Action.ALLOW,
      });
    });

    // Deny all other inbound traffic
    privateNacl.addEntry('DenyOtherInbound', {
      ruleNumber: 200,
      cidr: ec2.AclCidr.anyIpv4(),
      traffic: ec2.AclTraffic.allTraffic(),
      direction: ec2.TrafficDirection.INGRESS,
      ruleAction: ec2.Action.DENY,
    });

    // Allow outbound traffic to Isolated Subnets
    isolatedSubnetCidrs.forEach((cidr, index) => {
      privateNacl.addEntry(`AllowIsolatedOutbound${index}`, {
        ruleNumber: 300 + index,
        cidr: ec2.AclCidr.ipv4(cidr),
        traffic: ec2.AclTraffic.allTraffic(),
        direction: ec2.TrafficDirection.EGRESS,
        ruleAction: ec2.Action.ALLOW,
      });
    });

    // Deny all other outbound traffic
    privateNacl.addEntry('DenyOtherOutbound', {
      ruleNumber: 400,
      cidr: ec2.AclCidr.anyIpv4(),
      traffic: ec2.AclTraffic.allTraffic(),
      direction: ec2.TrafficDirection.EGRESS,
      ruleAction: ec2.Action.DENY,
    });

    // Configure Isolated Subnet NACL
    // Allow inbound traffic from Private Subnets
    privateSubnetCidrs.forEach((cidr, index) => {
      isolatedNacl.addEntry(`AllowPrivateInbound${index}`, {
        ruleNumber: 100 + index,
        cidr: ec2.AclCidr.ipv4(cidr),
        traffic: ec2.AclTraffic.allTraffic(),
        direction: ec2.TrafficDirection.INGRESS,
        ruleAction: ec2.Action.ALLOW,
      });
    });

    // Deny all other inbound traffic
    isolatedNacl.addEntry('DenyOtherInbound', {
      ruleNumber: 200,
      cidr: ec2.AclCidr.anyIpv4(),
      traffic: ec2.AclTraffic.allTraffic(),
      direction: ec2.TrafficDirection.INGRESS,
      ruleAction: ec2.Action.DENY,
    });

    // Allow outbound traffic to Private Subnets
    privateSubnetCidrs.forEach((cidr, index) => {
      isolatedNacl.addEntry(`AllowPrivateOutbound${index}`, {
        ruleNumber: 300 + index,
        cidr: ec2.AclCidr.ipv4(cidr),
        traffic: ec2.AclTraffic.allTraffic(),
        direction: ec2.TrafficDirection.EGRESS,
        ruleAction: ec2.Action.ALLOW,
      });
    });

    // Deny all other outbound traffic
    isolatedNacl.addEntry('DenyOtherOutbound', {
      ruleNumber: 400,
      cidr: ec2.AclCidr.anyIpv4(),
      traffic: ec2.AclTraffic.allTraffic(),
      direction: ec2.TrafficDirection.EGRESS,
      ruleAction: ec2.Action.DENY,
    });
  }
}
