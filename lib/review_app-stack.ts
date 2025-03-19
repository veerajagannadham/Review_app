import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

import { Construct } from "constructs";

export class ReviewAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //get review lambda
    const getReviews = new lambdanode.NodejsFunction(this, "getReviews", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: `${__dirname}/../lambdas/getMovieReview.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
    });

    //get review URL
    const getReviewsURL = getReviews.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
      cors: {
        allowedOrigins: ["*"],
      },
    });

    //DynamoDB Review Table
    const reviewsTable = new dynamodb.Table(this, "ReviewsTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {name: 'movieId', type: dynamodb.AttributeType.NUMBER},
      sortKey: {name: 'reviewId', type: dynamodb.AttributeType.NUMBER},
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "ReviewsTable",
    });

    new cdk.CfnOutput(this, "Get Review Url", { value: getReviewsURL.url });
  }
}
