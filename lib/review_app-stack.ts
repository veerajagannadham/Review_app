import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as custom from "aws-cdk-lib/custom-resources";
import * as apig from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";

import { Construct } from "constructs";
import { generateBatch } from "../shared/util";
import { reviews } from "../seed/reviews";

export class ReviewAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Review Table
    const reviewsTable = new dynamodb.Table(this, "ReviewsTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "movieId", type: dynamodb.AttributeType.NUMBER },
      sortKey: { name: "reviewId", type: dynamodb.AttributeType.NUMBER },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "ReviewsTable",
    });

    // Get review lambda
    const getReviews = new lambdanode.NodejsFunction(this, "getReviews", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: `${__dirname}/../lambdas/getMovieReview.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        TABLE_NAME: reviewsTable.tableName,
        REGION: "eu-west-1",
      },
    });

    // Get translation lambda
    const getTranslation = new lambdanode.NodejsFunction(this, "getTranslation", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: `${__dirname}/../lambdas/getTranslations.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        TABLE_NAME: reviewsTable.tableName,
        REGION: "eu-west-1",
      },
    });

    // Update Review lambda
    const updateReview = new lambdanode.NodejsFunction(this, "updateReview", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: `${__dirname}/../lambdas/updateReviews.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        TABLE_NAME: reviewsTable.tableName,
        REGION: "eu-west-1",
      },
    });

    // Update Review lambda
    const addReview = new lambdanode.NodejsFunction(this, "addReview", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: `${__dirname}/../lambdas/addReviews.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        TABLE_NAME: reviewsTable.tableName,
        REGION: "eu-west-1",
      },
    });

    // Initialize data in DynamoDB
    new custom.AwsCustomResource(this, "reviewsddbInitData", {
      onCreate: {
        service: "DynamoDB",
        action: "batchWriteItem",
        parameters: {
          RequestItems: {
            [reviewsTable.tableName]: generateBatch(reviews),
          },
        },
        physicalResourceId: custom.PhysicalResourceId.of("reviewsddbInitData"),
      },
      policy: custom.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [reviewsTable.tableArn],
      }),
    });

    // REST API 
    const api = new apig.RestApi(this, "RestAPI", {
      description: "demo api",
      deployOptions: {
        stageName: "dev",
      },
      defaultCorsPreflightOptions: {
        allowHeaders: ["Content-Type", "X-Amz-Date"],
        allowMethods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
        allowCredentials: true,
        allowOrigins: ["*"],
      },
    });

    // Get Review Endpoint
    const moviesEndpoint = api.root.addResource("movies");
    const moviesreviewsEndpoint = moviesEndpoint.addResource("reviews");
    const moviesreviewsmovieidEndpoint = moviesreviewsEndpoint.addResource("{movieId}");
    moviesreviewsmovieidEndpoint.addMethod("GET", new apig.LambdaIntegration(getReviews, { proxy: true }));

    // Get Translation Endpoint
    const reviewsEndpoint = api.root.addResource("reviews");
    const reviewsreviewIdEndpoint = reviewsEndpoint.addResource("{reviewId}");
    const reviewsreviewIdmovieidEndpoint = reviewsreviewIdEndpoint.addResource("{movieId}");
    const translationEndpoint = reviewsreviewIdmovieidEndpoint.addResource("translation");
    translationEndpoint.addMethod("GET", new apig.LambdaIntegration(getTranslation, { proxy: true }));

    //Update Review Endpoint
    const moviesmovieIdEndpoint = moviesEndpoint.addResource("{movieId}");
    const moviesmovieIdreviewsEndpoint = moviesmovieIdEndpoint.addResource("reviews");
    const moviesmovieIdreviewsreviewIdEndpoint = moviesmovieIdreviewsEndpoint.addResource("{reviewId}");
    moviesmovieIdreviewsreviewIdEndpoint.addMethod("PUT",new apig.LambdaIntegration(updateReview, { proxy: true }));


    //Add Review Endpoint
    moviesreviewsEndpoint.addMethod("POST", new apig.LambdaIntegration(addReview, { proxy: true }))

    // Permissions
    reviewsTable.grantReadData(getReviews);
    reviewsTable.grantReadData(getTranslation);
    reviewsTable.grantReadWriteData(updateReview);
    reviewsTable.grantReadWriteData(addReview);

    // Add TranslateText permission to the getTranslation Lambda
    getTranslation.role?.attachInlinePolicy(new iam.Policy(this, 'TranslateTextPolicy', {
      statements: [
        new iam.PolicyStatement({
          actions: ['translate:TranslateText'],
          resources: ['*'], // Consider restricting to specific resources if possible
        }),
      ],
    }));
  }
}