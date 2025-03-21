import { marshall } from "@aws-sdk/util-dynamodb";
import { Reviews } from "./types"
import { CognitoJwtVerifier } from "aws-jwt-verify";

export const generateReviewItem = (reviews: Reviews)=>{
    return {
        PutRequest: {
            Item : marshall(reviews),
        },
    };
};


export const generateBatch = (data: Reviews[])=>{
    return data.map((e)=>{
        return generateReviewItem(e);
    })
};


export const getFormattedDate = () => {
    // Create a new Date object
    const date = new Date();

      // Extract day, month, and year
  const day = String(date.getDate()).padStart(2, "0"); // Ensure 2 digits for day
  const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-indexed, so add 1
  const year = date.getFullYear();

  // Combine into DD-MM-YYYY format
  return `${day}-${month}-${year}`;
};

// Verifier that expects valid access tokens:
export const JWTVerifier = CognitoJwtVerifier.create({
    userPoolId: "eu-west-1_w8qNDAepr",
    tokenUse: "id",
    clientId: "5p442esh5eoc1c66e8h301n4qo",
  });