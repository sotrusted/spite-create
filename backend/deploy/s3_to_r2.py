# Copy every object from the production S3 bucket to R2, skipping keys R2
# already has (so it can be re-run as a final sync right before switching).
import os
import boto3
from botocore.config import Config
from decouple import Config as EnvConfig, RepositoryEnv

config = EnvConfig(RepositoryEnv(os.path.join(os.getcwd(), '.env')))

src = boto3.client('s3', region_name=config('AWS_S3_REGION_NAME', default='us-east-1'),
                   aws_access_key_id=config('AWS_ACCESS_KEY_ID'),
                   aws_secret_access_key=config('AWS_SECRET_ACCESS_KEY'))
src_bucket = config('AWS_STORAGE_BUCKET_NAME', default='cmim-media-195275646962')
dst = boto3.client('s3', endpoint_url=os.environ['R2_ENDPOINT'], region_name='auto',
                   aws_access_key_id=os.environ['R2_KEY'],
                   aws_secret_access_key=os.environ['R2_SECRET'],
                   config=Config(signature_version='s3v4'))
dst_bucket = os.environ['R2_BUCKET']

have = set()
for page in dst.get_paginator('list_objects_v2').paginate(Bucket=dst_bucket):
    have.update(o['Key'] for o in page.get('Contents', []))

copied = skipped = 0
for page in src.get_paginator('list_objects_v2').paginate(Bucket=src_bucket):
    for o in page.get('Contents', []):
        key = o['Key']
        if key in have:
            skipped += 1
            continue
        obj = src.get_object(Bucket=src_bucket, Key=key)
        dst.put_object(Bucket=dst_bucket, Key=key, Body=obj['Body'].read(),
                       ContentType=obj.get('ContentType') or 'image/png',
                       CacheControl='public, max-age=31536000, immutable')
        copied += 1

total = sum(p.get('KeyCount', 0) for p in dst.get_paginator('list_objects_v2').paginate(Bucket=dst_bucket))
print(f'copied {copied}, already present {skipped}, R2 now holds {total}')
