import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { UserPool, UserPoolClient } from "aws-cdk-lib/aws-cognito";
import * as apig from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as node from "aws-cdk-lib/aws-lambda-nodejs";

export class AuthAppStack extends cdk.Stack {
  private auth: apig.IResource;
  private userPool: UserPool;
  private userPoolClient: UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create Cognito User Pool
    this.userPool = new UserPool(this, "UserPool", {
      signInAliases: { username: true, email: true },
      selfSignUpEnabled: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Add an app client to the User Pool
    this.userPoolClient = this.userPool.addClient("AppClient", {
      authFlows: { userPassword: true },
    });

    // Create API Gateway
    const authApi = new apig.RestApi(this, "AuthServiceApi", {
      description: "Authentication Service RestApi",
      endpointTypes: [apig.EndpointType.REGIONAL],
      defaultCorsPreflightOptions: {
        allowOrigins: apig.Cors.ALL_ORIGINS,
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });

    // Add the "auth" resource to the API
    this.auth = authApi.root.addResource("auth");

    // Add signup route
    this.addAuthRoute(
      "signup", // Resource name
      "POST",   // HTTP method
      "SignupFn", // Lambda function name
      "signup.ts" // Lambda function entry file
    );

    // Add Confirm-signup route
    this.addAuthRoute(
        "confirm_signup",
        "POST",
        "ConfirmFn",
        "confirm-signup.ts"
      );
  }

  private addAuthRoute(
    resourceName: string,
    method: string,
    fnName: string,
    fnEntry: string
  ): void {
    // Common Lambda function properties
    const commonFnProps = {
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "handler",
      environment: {
        USER_POOL_ID: this.userPool.userPoolId,
        CLIENT_ID: this.userPoolClient.userPoolClientId,
        REGION: cdk.Aws.REGION,
      },
    };

    // Create the Lambda function
    const fn = new node.NodejsFunction(this, fnName, {
      ...commonFnProps,
      entry: `${__dirname}/../lambdas/auth/${fnEntry}`, // Path to the Lambda function code
    });

    // Grant the Lambda function permissions to call Cognito APIs
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cognito-idp:SignUp"],
        resources: [this.userPool.userPoolArn],
      })
    );

    // Add the resource and method to the API
    const resource = this.auth.addResource(resourceName);
    resource.addMethod(method, new apig.LambdaIntegration(fn));
  }
}