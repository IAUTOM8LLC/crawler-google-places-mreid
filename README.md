# Google Maps Scraper

- [Features](#Features)
- [Input configuration](#input-configuration)
- [Results](#results)
- [Usage on Apify platform and locally](#usage-on-apify-platform-and-locally)
- [How the search works](#how-the-search-works)
- [Using country, state and city parameters](#using-country-state-and-city-parameters)
- [Changelog](#changelog)

## Features
This Google Maps crawler will enable you to get more data from Google Places than the official [Google Maps Places API](https://developers.google.com/places/web-service/search).

The official Google Maps Places API is the best option for most use cases, but this scraper can provide:

- Unlimited results
- Popular place times histogram (no data for that in official API)
- All place reviews (up to 5 reviews from official API)
- All place photos (up to 10 photos from official API)

## Input configuration
When running the Google Maps Scraper, you need to provide input to configure what and how should be scraped. This input is provided either as a JSON file or in the editor on the Apify platform. Most input fields have reasonable default values.

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

- Search and URLs
    - `startUrls` \<Array\<[Request](https://sdk.apify.com/docs/api/request#docsNav)\>\> A list of URLs. Can be search or place URLs.
    - `searchStringsArray` \<Array\<string\>\> Array of strings, that will be searched on Google maps. It is also possible to fill [Google Place ID](https://developers.google.com/places/place-id) in format `place_id:ChIJp4JiUCNP0xQR1JaSjpW_Hms`
    - `language` \<string\> Sets the language for the interface. Can also affect the returned reviews language. **Default: `en`**
- General settings
    - `proxyConfig` \<ProxyConfiguration\> Apify proxy configuration - required to provide proxy when running on the Apify platform. **Default: `{ useApifyProxy: true }`**
    - `maxCrawledPlaces` \<number\> Limit the number of places you want to get from the crawler **Default: `20`**
- Output configuration
    - `maxReviews` \<number\> Maximum number of reviews per place. **Default: `0`**
    - `maxImages` \<number\> Maximum number of images per place. **Default: `0`**
    - `includeHistogram` \<boolean\> If checked, the crawler scrapes popular times for all places. You can speed up crawling if you disable this. **Default: `false`**
    - `includeOpeningHours` \<boolean\> If checked, the crawler scrapes opening hours for all places. You can speed up crawling if you disable this. **Default: `false`**
    - `includePeopleAlsoSearch` \<boolean\> If checked, the crawler scrapes \"people also search\" for all places. You can speed up crawling if you disable this. **Default: `false`**
    - `additionalInfo` \<boolean\> Export additional info: Service Options, Highlights, Offerings,... **Default: `false`**
    - `reviewsSort` \<string\> sort place reviews before extraction. **Default: `mostRelevant`**
    - `exportPlaceUrls` \<boolean\> Won't crawl through place pages, return links to places. **Default: `false`**
- Localization (choose either country/state/city or lat/long)
    - `country` \<string\> Country name for polygon localization
    - `state` \<string\> State name for polygon localization
    - `city` \<string\> City name for polygon localization
    - `postalCode` \<string\> Set a postal code where the search should be performed - e.g. 10001. Select a country as well to ensure the correct postal code is used. For a more accurate search, set `lat` and `lng`.
    - `lat` \<string\> Use with combination with longitude and zoom to set up viewport to search on. Do not use `lat` and `lng` in combination with polygon localization (`country`, `state`, `city`).
    - `lng` \<string\> Use with combination with latitude and zoom to set up viewport to search on. Do not use `lat` and `lng` in combination with polygon localization (`country`, `state`, `city`).
    - `zoom` \<number\> Viewport zoom, e.g zoom: 17 in Google Maps URL -> https://www.google.com/maps/@50.0860729,14.4135326,17z vs zoom: 10 -> https://www.google.com/maps/@50.0860729,14.4135326,10z. `1` is the whole world and `21` is a tiny street. We recommend a number between 10 and 17. **Default: `12`**
    - `maxAutomaticZoomOut` \<number\> A parameter to stop searching once Google zooms out too far. It counts how far it has zoomed out from the first page. Keep in mind that `zoom: 1` is the whole world and `zoom: 21` is a tiny street. So you usually want `maxAutomaticZoomOut` to be between `0` and `5`. Also, note that Google zooms a bit differently in each run.
- Browser and page settings
    - `maxConcurrency` \<number\> The maximum number of pages that will be processed in parallel. **Default: `100`**
    - `maxPageRetries` \<number\> Max page retries. **Default: `6`**
    - `pageLoadTimeoutSec` \<number\> Max times that the page can be loading. **Default: `60`**
    - `maxPagesPerBrowser` \<number\> How many pages can be opened at once for each browser. Having more pages in one browser is faster but can lead to increased blocking. **Default: `1`**
    - `useChrome` \<boolean\> Uses full Chrome browser instead of Chromium. Be careful, it is not stable on some versions! **Default: `false`**
- Miscellaneous
    - `debug` \<boolean\> Debug messages will be included in log. **Default: `false`**
    - `cachePlaces` \<boolean\> Add caching locations between runs. `placeId: location` is stored in a named key-value store. Can speed up regular runs using polygon search. **Default: `false`**

### Country localization
You can force the scraper to access places only from a specific country location. We recommend this to ensure the correct language in the results. This only works reliably for the US (most of our proxies are from the US). Currently, this option is not available in the Editor input - you have switch to JSON input. After you switch, your configuration will remain the same, so just update the `proxyconfig` field with `apifyProxyCountry` property to specify the country, e.g.

```json
"proxyConfig": {
    "useApifyProxy": true,
    "apifyProxyCountry": "US"
  }
```

## Results
The scraped data is stored in the dataset of each run. The data can be viewed or downloaded in many popular formats like JSON, CSV, Excel, XML, RSS and HTML.

A single place result looks like this:

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

## Usage on Apify platform and locally
If you want to run the actor on the [Apify platform](https://apify.com), you need to have at least a few proxy IPs to avoid being blocked by Google. You can use your free Apify Proxy trial or you can subscribe to one of [Apify's subscription plans](https://apify.com/pricing).

### Compute unit consumption
It is recommended to run the actor with at least 8GB memory. On the Apify platform, 8GB memory gives you:
- 100 Google place details for 1-2 compute units
- 100 Google place details with images and reviews for 4-8 compute units - the usage really depends on the number of images and reviews for each place scraped.

### Running locally or on a different platform
You can easily run this scraper locally or on your favorite platform. It can run as a simple Node.js process or inside a Docker container.

## How the search works
It works exactly as though you were searching Google Maps on your computer. It opens https://www.google.com/maps/ and relocates to the specified location, then writes the search to the input. Then it presses the next page button until it reaches the final page or `maxCrawledPlaces`. It enqueues all the places as separate pages and then scrapes them. If you are unsure about anything, just try this process in your browser - the scraper does exactly the same.

### Google automatically expands the search location
There is one feature of Google Maps that is sometimes not desirable. As you progress to the next page, there might not be enough places of the type that you have searched for, e.g. restaurants in your city. Google will naturally zoom out and include places from a broader area. It will happily do this over a large area and might include places from far out that you are not interested in. There are three ways to solve this:

- Limit `maxCrawledPlaces` - This is the simplest option, but you usually don't know how many places there are, so it is not that useful.
- Use the `maxAutomaticZoomOut` parameter to stop searching once Google zooms out too far. It counts how far it zoomed out from the first page. Keep in mind that `zoom: 1` is the whole world and `zoom: 21` is a tiny street. So you usually want `maxAutomaticZoomOut` to be between `0` and `5`.
- Use `country`, `state`, `city` parameters.

## Using country, state and city parameters
You can only use `country` or `country` + `state` or `country` + `state` + `city`. The scraper uses [nominatim maps](https://nominatim.org/) to find a location polygon and then splits that into multiple searches that cover the whole area. You should play around with the `zoom` number to find the ideal granularity for searches. Too small a zoom level will find only the most famous places over a large area, too big a zoom level will lead to overlapping places and will consume a huge number of CUs. We recommend a number between 10 and 15.

#### Warning: Don't use too big zoom level (17+) with country, state, city parameters

## Changelog
This scraper is under active development. We are always implementing new features and fixing bugs. If you would like to see a new feature, please submit an issue on GitHub. Check [CHANGELOG.md](https://github.com/drobnikj/crawler-google-places/blob/master/CHANGELOG.md) for a list of recent updates
