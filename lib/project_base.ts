import { Construct } from 'constructs';
import { VPCBase } from './vpc/vpc_base';
import { RelationalDb } from './db/relational_db';
import { Api } from './api/api';
import { UI } from './ui/ui';
import { Lazy } from 'aws-cdk-lib';


export class ProjectBase extends Construct {
  private vpc: VPCBase;
  private relationalDb: RelationalDb;
  private api: Api;
  private ui: UI;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.vpc = new VPCBase(this, 'VPC');

    this.relationalDb = new RelationalDb(this, 'RelationalDb', {
      vpc: this.vpc.vpc
    })

    this.api = new Api(this, 'Api', {
      vpc: this.vpc.vpc,
      dbCluster: this.relationalDb.dbCluster
    });

    this.ui = new UI(this, 'UI', {
      vpc: this.vpc.vpc,
      apiUrl: this.api.url
    })

    // TODO: CustomResource to handle cors! It should probably run a lambda that iterates through all
    // methods and adds an OPTIONS method, and adds an ALLOWED_ORIGIN var to each lamba...
  }
}
