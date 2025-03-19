import { marshall } from "@aws-sdk/util-dynamodb";
import { Reviews } from "./types"

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
}