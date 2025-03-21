import { Aws } from "aws-cdk-lib";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as apig from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as node from "aws-cdk-lib/aws-lambda-nodejs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as custom from "aws-cdk-lib/custom-resources";
import * as iam from "aws-cdk-lib/aws-iam";
import { generateBatch } from "../shared/util";
import { reviews } from "../seed/reviews";

type AppApiProps = {
  userPoolId: string;
  userPoolClientId: string;
};

export class AppApi extends Construct {
  constructor(scope: Construct, id: string, props: AppApiProps) {
    super(scope, id);

    // DynamoDB Review Table
    const reviewsTable = new dynamodb.Table(this, "ReviewsTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "movieId", type: dynamodb.AttributeType.NUMBER },
      sortKey: { name: "reviewId", type: dynamodb.AttributeType.NUMBER },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "ReviewsTable",
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

    const appApi = new apig.RestApi(this, "AppApi", {
      description: "App RestApi",
      endpointTypes: [apig.EndpointType.REGIONAL],
      defaultCorsPreflightOptions: {
        allowOrigins: apig.Cors.ALL_ORIGINS,
      },
    });

    const appCommonFnProps = {
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "handler",
      environment: {
        USER_POOL_ID: props.userPoolId,
        CLIENT_ID: props.userPoolClientId,
        REGION: cdk.Aws.REGION,
        TABLE_NAME: reviewsTable.tableName,
      },
    };

    // Get review lambda
    const getReviews = new node.NodejsFunction(this, "getReviews", {
      ...appCommonFnProps,
      entry: `${__dirname}/../lambdas/getMovieReview.ts`,
    });

    // Get translation lambda
    const getTranslation = new node.NodejsFunction(this, "getTranslation", {
      ...appCommonFnProps,
      entry: `${__dirname}/../lambdas/getTranslations.ts`,
    });

    // Update Review lambda
    const updateReview = new node.NodejsFunction(this, "updateReview", {
      ...appCommonFnProps,
      entry: `${__dirname}/../lambdas/updateReviews.ts`,
    });

    // Add Review lambda
    const addReview = new node.NodejsFunction(this, "addReview", {
      ...appCommonFnProps,
      entry: `${__dirname}/../lambdas/addReviews.ts`,
    });

    // Authorizer Lambda Function
    const authorizerFn = new node.NodejsFunction(this, "AuthorizerFn", {
      ...appCommonFnProps,
      entry: `${__dirname}/../lambdas/auth/authorizer.ts`,
    });

    // Request Authorizer
    const requestAuthorizer = new apig.RequestAuthorizer(this, "RequestAuthorizer", {
      identitySources: [apig.IdentitySource.header("Cookie")],
      handler: authorizerFn,
      resultsCacheTtl: cdk.Duration.minutes(0),
    });

    // Get Review Endpoint
    const moviesEndpoint = appApi.root.addResource("movies");
    const moviesreviewsEndpoint = moviesEndpoint.addResource("reviews");
    const moviesreviewsmovieidEndpoint = moviesreviewsEndpoint.addResource("{movieId}");
    moviesreviewsmovieidEndpoint.addMethod("GET", new apig.LambdaIntegration(getReviews, { proxy: true }));

    // Get Translation Endpoint
    const reviewsEndpoint = appApi.root.addResource("reviews");
    const reviewsreviewIdEndpoint = reviewsEndpoint.addResource("{reviewId}");
    const reviewsreviewIdmovieidEndpoint = reviewsreviewIdEndpoint.addResource("{movieId}");
    const translationEndpoint = reviewsreviewIdmovieidEndpoint.addResource("translation");
    translationEndpoint.addMethod("GET", new apig.LambdaIntegration(getTranslation, { proxy: true }));

    // Update Review Endpoint (with Authorization)
    const moviesmovieIdEndpoint = moviesEndpoint.addResource("{movieId}");
    const moviesmovieIdreviewsEndpoint = moviesmovieIdEndpoint.addResource("reviews");
    const moviesmovieIdreviewsreviewIdEndpoint = moviesmovieIdreviewsEndpoint.addResource("{reviewId}");
    moviesmovieIdreviewsreviewIdEndpoint.addMethod(
      "PUT",
      new apig.LambdaIntegration(updateReview, { proxy: true },),
      {
        authorizer: requestAuthorizer,
        authorizationType: apig.AuthorizationType.CUSTOM,
      }
    );

    // Add Review Endpoint (with Authorization)
    moviesreviewsEndpoint.addMethod(
      "POST",
      new apig.LambdaIntegration(addReview, { proxy: true }),
      {
        authorizer: requestAuthorizer,
        authorizationType: apig.AuthorizationType.CUSTOM,
      }
    );

    // Permissions
    reviewsTable.grantReadData(getReviews);
    reviewsTable.grantReadData(getTranslation);
    reviewsTable.grantReadWriteData(updateReview);
    reviewsTable.grantReadWriteData(addReview);

    // Add TranslateText permission to the getTranslation Lambda
    getTranslation.role?.attachInlinePolicy(
      new iam.Policy(this, "TranslateTextPolicy", {
        statements: [
          new iam.PolicyStatement({
            actions: ["translate:TranslateText"],
            resources: ["*"],
          }),
        ],
      })
    );

    // Grant the Authorizer Lambda permissions to access Cognito
    authorizerFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cognito-idp:GetUser"],
        resources: ["*"],
      })
    );
  }
}