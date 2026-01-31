import { BigQuery } from '@google-cloud/bigquery';
import config from './index';

export const bigquery = new BigQuery({
  projectId: config.bigquery.projectId,
});

export const dataset = bigquery.dataset(config.bigquery.dataset);

export default bigquery;
