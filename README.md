# Google Maps Scraper

<!-- toc start -->
- [Features](#features)
- [Advantages over Google Maps API](#advantages-over-google-maps-api)
- [Input configuration](#input-configuration)
- [Results](#results)
- [Usage on Apify platform and locally](#usage-on-apify-platform-and-locally)
- [How the search works](#how-the-search-works)
- [Using country, state, county, city and postal code parameters](#using-country-state-county-city-and-postal-code-parameters)
- [Personal data](#personal-data)
- [Changelog](#changelog)
- [Contributions](#contributions)
<!-- toc end -->

## Features
This Google Maps crawler will enable you to get more and faster data from Google Places than the official [Google Maps Places API](https://developers.google.com/places/web-service/search). Read our step-by-step guide on [how to scrape Google Maps](https://blog.apify.com/step-by-step-guide-to-scraping-google-maps/) to understand how to configure the scraper and get ideas on how you can use the data you can extract.

Our unofficial Google Maps API enables you to extract all of the following data from Google Maps:

- Title, subtitle, category, place ID, and URL
- Address, location, plus code and exact coordinates
- Phone and website if available
- Temporarily or permanently closed status
- Popular times - histogram & live occupancy
- Average rating (`totalScore`), review count, and review distribution
- List of images (optional)
- List of detailed characteristics (`additionalInfo`, optional)
- Opening hours (optional)
- People also search (optional)

The scraper also supports the scraping of all detailed information about reviews:
- Review text
- Published date
- Stars
- Review ID & URL
- Response from owner - text and published date

Personal data extraction about reviewers has to be explicitly enabled in input (see  [Personal data section](#personal-data)):
- Reviewer name
- Reviewer ID & URL
- Reviewer number of reviews
- Is Local Guide

The Google Maps Scraper also provides other very useful features:
- Geolocation - Enables scraping whole country, state, county, city, or postal code (integration with Nomatim Maps API)
- Language & translation settings
- Reviews sorting
- Proxy configuration
- Browser & scraping configuration

## Advantages over Google Maps API
The official Google Maps Places API is an adequate option for many use cases, but this unofficial Google Maps API provides more cost-effective, comprehensive results, and also scrapes histograms for popular times, which aren't available in the official API. While you are no longer limited to a maximum number of requests per day with the Google Places API, there are still rate limits and quotas that apply. Our Google Maps API enforces no such rate limits or quotas.

## Input configuration
When running the Google Maps Scraper, you need to configure what you want to scrape and how it should be scraped. This input is provided either as a JSON file or in the editor on the Apify platform. Most input fields have reasonable default values.

Example input:
```json
{
  "searchStringsArray": ["pubs near prague"],
  "lat": "50.0860729",
  "lng": "14.4135326",
  "zoom": 10
}
```
With this input, the actor searches places at this start URL: https://www.google.com/maps/search/pubs+near+prague/@50.0860729,14.4135326,10z

For detailed descriptions and examples for all input fields, please visit the dedicated [Input page](https://apify.com/drobnikj/crawler-google-places/input-schema).

### Country localization
You can force the scraper to access places only from a specific country. We recommend this to ensure that you receive the correct language in the results. This only works reliably for the US (most of our proxies are from the US). Currently, this option is not available in the Editor input - you have to switch to JSON input. After you switch, your configuration will remain the same, so just update the `proxyconfig` field with `apifyProxyCountry` property to specify the country, e.g.

```json
"proxyConfig": {
    "useApifyProxy": true,
    "apifyProxyCountry": "US"
  }
```

## Results
The scraped data is stored in the dataset of each run. The data can be viewed or downloaded in many popular formats, such as JSON, CSV, Excel, XML, RSS, and HTML.

The result for a single Google Place looks like this:

```jsonc
{
  "title": "The PUB Praha 2",
  "totalScore": 4,
  "categoryName": "Restaurant",
  "address": "Hálkova 6, 120 00 Nové Město, Czechia",
  "locatedIn": "Azalea Square",
  "plusCode": "3CGH+F8 New Town, Prague, Czechia",
  "website": "thepub.cz",
  "phone": "+420222940414",
  "temporarilyClosed": false,
  "permanentlyClosed": false,
  "rank": 1,
  "placeId": "ChIJXRQlXoyUC0cRq5R4OBRKKxU",
  "url": "https://www.google.com/maps/place/The+PUB+Praha+2/@50.0761791,14.4261789,17z/data=!3m1!4b1!4m5!3m4!1s0x470b948c5e25145d:0x152b4a14387894ab!8m2!3d50.0761791!4d14.4283676",
  "location": {
    "lat": 50.0761791,
    "lng": 14.4283676
  },
  "searchString": "pubs near prague 2",
  "popularTimesLiveText": "25% busy at .; Not too busy",
  "popularTimesLivePercent": 25,
  "popularTimesHistogram": {
    "Su": [],
    "Mo": [
      {
        "hour": 6,
        "occupancyPercent": 0
      },
      {
        "hour": 7,
        "occupancyPercent": 0
      },
      {
        "hour": 8,
        "occupancyPercent": 0
      },
      {
        "hour": 9,
        "occupancyPercent": 0
      }
      // ... (shortened)
    ],
    // ... (shortened)
  },
  "openingHours": [
    {
      "day": "Monday",
      "hours": "11AM–2AM"
    },
    {
      "day": "Tuesday",
      "hours": "11AM–2AM"
    },
    {
      "day": "Wednesday",
      "hours": "11AM–2AM"
    },
    // ... (shortened)
  ],
  "peopleAlsoSearch": [],
  "reviewsCount": 698,
  "reviews": [
    {
      "name": "Robert Nalepa",
      "text": null,
      "publishAt": "a day ago",
      "likesCount": null,
      "stars": 4
    },
    {
      "name": "Martin Mudra",
      "text": null,
      "publishAt": "6 days ago",
      "likesCount": null,
      "stars": 4
    },
    // ... (shortened)
  ],
  "imageUrls": [
    "https://lh5.googleusercontent.com/p/AF1QipMQKrnbWNFed4bhBaMn_E1hf83ro3af1JT6BuPe=s508-k-no",
    "https://lh5.googleusercontent.com/p/AF1QipNVV1EkzaddM7UsE9bh0KgT5BFIRfvAwsRPVo0a=s516-k-no",
    "https://lh5.googleusercontent.com/p/AF1QipPDAjMIuulyFvHqTWCz_xeQhiDgretyMsHO6Rq_=s677-k-no",
    "https://lh5.googleusercontent.com/p/AF1QipOEsLwms2XreZ7_kzgH_As5SeTfS7jz32ctw5iY=s516-k-no",
    // ... (shortened)
  ],
  "additionalInfo": {
    "Service options": [
      {
        "Takeaway": true
      },
      {
        "Delivery": false
      }
    ],
    "Highlights": [
      {
        "Bar games": true
      },
      {
        "Karaoke": true
      },
      {
        "Live music": true
      },
      {
        "Outdoor seating": true
      }
    ],
    "Offerings": [
      {
        "Beer": true
      },
      {
        "Food": true
      },
      {
        "Vegetarian options": true
      },
      {
        "Wine": true
      }
    ],
    "Dining options": [
      {
        "Breakfast": true
      },
      {
        "Lunch": true
      },
      {
        "Dinner": true
      },
      {
        "Dessert": true
      },
      {
        "Seating": true
      }
    ],
    "Amenities": [
      {
        "Toilets": true
      }
    ],
    "Atmosphere": [
      {
        "Casual": true
      },
      {
        "Cosy": true
      }
    ],
    "Crowd": [
      {
        "Groups": true
      }
    ],
    "Planning": [
      {
        "LGBTQ-friendly": true
      }
    ]
  }
}
```

### Adjusting output format
The Apify platform allows you to choose from many dataset formats, but also to restructure the output itself.

#### One review per row
Normally, each result item contains data about a single place. Each item is displayed as one row in tabulated formats. There is a lot of data about each place, so the tabulated formats get very messy and hard to analyze. Fortunately, there is a solution.

For example, if you need to analyze reviews, you can configure the download to only contain the data you need and adjust the row/column format. Here's how to get a list of reviews with a place title one review per row:
 copy the download link in the format you need, paste it to a different tab, and add `&unwind=reviews&fields=reviews,title` to the end of the link URL, and then press Enter to download it. `unwind=reviews` means that each review will be on its own row. `fields=reviews,title` means that only reviews and title will be downloaded, skipping the other data. Otherwise, the output would be very big, but it's also no problem if you don't use `fields` at all. 

The whole download link for, e.g. CSV would look like this (with dataset ID):
https://api.apify.com/v2/datasets/DATASET_ID/items?clean=true&format=csv&attachment=true&unwind=reviews&fields=reviews,title

## Usage on Apify platform and locally
If you want to run the actor on the [Apify platform](https://apify.com), you may need to use some proxy IP addresses. You can use your free Apify Proxy trial or you can subscribe to one of [Apify's subscription plans](https://apify.com/pricing).

### Running locally or on a different platform
You can easily run this scraper locally or on your favorite platform. It can run as a simple Node.js process or inside a Docker container.

## How the search works
It works exactly as though you were searching Google Maps on your computer. It opens https://www.google.com/maps/ and relocates to the specified location, then writes the search to the input. Then it presses the next page button until it reaches the final page or `maxCrawledPlaces`. It enqueues all the places as separate pages and then scrapes them. If you are unsure about anything, just try this process in your browser - the scraper does exactly the same thing.

### Google automatically expands the search location
There is one feature of Google Maps that is sometimes not desirable. As you progress to the next page, there might not be enough places of the type that you have searched for, e.g. restaurants in your city. Google will naturally zoom out and include places from a broader area. It will happily do this over a large area and might include places from far away that you are not interested in. There are three ways to solve this:

- Limit `maxCrawledPlaces` - This is the simplest option, but you usually don't know how many places there are, so it isn't that useful.
- Use the `maxAutomaticZoomOut` parameter to stop searching once Google zooms out too far. It counts how far it zoomed out from the first page. Keep in mind that `zoom: 1` is the whole world and `zoom: 21` is a tiny street. So you usually want `maxAutomaticZoomOut` to be between `0` and `5`.
- Use `country`, `state`, `county`, `city` & `postalCode` parameters.

## Using country, state, county, city, and postal code parameters
You can only use any combination of the geolocation parameters: `country`, `state`, `county`, `city` & `postalCode`. The scraper uses [nominatim maps](https://nominatim.org/) to find a location polygon and then splits that into multiple searches that cover the whole area. You should play around with the `zoom` number to find the ideal granularity for searches. Too small a zoom level will find only the most famous places over a large area, too big a zoom level will lead to overlapping places and will consume more Apify platform credits. We recommend a number between 10 and 15.

#### Warning: Don't use too big a zoom level (17+) with country, state, city parameters

## Manual polygon

The easiest way to use our Google Maps Scraper is to provide `country`, `state`, `county`, `city` or `postalCode` input parameters. But in some rare cases, your location might not be found or you may want to customize it. In that case, you can use a manual polygon for the creation of start URLs. It should have the following GeoJSON structure from the [Nominatim Api](https://nominatim.openstreetmap.org)
(see [here for the example of Cambridge in Great Britain](https://nominatim.openstreetmap.org/search?country=united%20kingdom&state=&city=cambridge&postalcode=&format=json&polygon_geojson=1&limit=1&polygon_threshold=0.005))

## Personal data
Reviews can contain personal data such as a name, profile image, and even a review ID that could be used to track down the reviewer. Personal data is protected by GDPR in the European Union and by other regulations around the world. You should not scrape personal data unless you have a legitimate reason to do so. If you're unsure whether your reason is legitimate, consult your lawyers. This scraper allows you to granularly select which personal data fields you want to extract from reviews and which not.

## Changelog
This scraper is under active development. We are always implementing new features and fixing bugs. If you would like to see a new feature, please submit an issue on GitHub. Check [CHANGELOG.md](https://github.com/drobnikj/crawler-google-places/blob/master/CHANGELOG.md) for a list of recent updates

## Contributions
We're always pleased to see issues or pull requests created by the community.

Special thanks to:
[mattiashtd](https://github.com/mattiashtd)
[zzbazza](https://github.com/zzbazza)
