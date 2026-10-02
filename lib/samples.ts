export type Sample = {
  id: string;
  name: string;
  file: string;
  table: string;
  blurb: string;
  rows: string;
  questions: string[];
};

export const SAMPLES: Sample[] = [
  {
    id: 'saas',
    name: 'SaaS subscriptions',
    file: '/data/saas_subscriptions.csv',
    table: 'subscriptions',
    blurb: 'Plans, seats, MRR and churn for a B2B tool, 2024 to 2025.',
    rows: '3,200 rows',
    questions: [
      'What is active MRR by plan?',
      'Show monthly signups in 2025 split by billing cycle',
      'Which acquisition channel has the highest churn rate?',
      'How many active subscriptions do we have right now?',
    ],
  },
  {
    id: 'bikes',
    name: 'City bike trips',
    file: '/data/bike_trips.csv',
    table: 'bike_trips',
    blurb: 'A year of trips with stations, rider type, bike type and weather.',
    rows: '4,200 rows',
    questions: [
      'How many trips per month, members vs casual riders?',
      'Which start stations are busiest?',
      'Does temperature relate to trip duration?',
      'What share of trips use electric bikes?',
    ],
  },
  {
    id: 'coffee',
    name: 'Coffee shop sales',
    file: '/data/coffee_sales.csv',
    table: 'coffee_sales',
    blurb: 'Order lines from three stores, January to September 2025.',
    rows: '4,800 rows',
    questions: [
      'Revenue by store per month',
      'What are the top 5 products by revenue?',
      'Which hours of the day are busiest?',
      'Do loyalty members spend more per order?',
    ],
  },
];
