import { titlecase } from '@nativescript-community/l';
import { getString, remove, setString } from '@nativescript/core/application-settings';
import { WeatherDataType, weatherDataIconColors } from '~/helpers/formatter';
import { lang } from '~/helpers/locale';
import { WeatherLocation, request } from './api';
import { CityWeather, Coord, OneCallResult } from './openweathermap';
import { prefs } from './preferences';

function readOwmApiKeySetting() {
    let key = getString('owmApiKey', OWM_MY_KEY || OWM_DEFAULT_KEY);
    DEV_LOG && console.log('readOwmApiKeySetting', key);
    if (key.length === 0) {
        remove('owmApiKey');
        key = OWM_MY_KEY || OWM_DEFAULT_KEY;
    }
    return key;
}

let owmApiKey = readOwmApiKeySetting();
prefs.on('key:owmApiKey', (event) => {
    owmApiKey = readOwmApiKeySetting();
});

export function setOWMApiKey(apiKey) {
    owmApiKey = apiKey;
    if (apiKey && apiKey.length) {
        setString('owmApiKey', apiKey);
    } else {
        remove('owmApiKey');
    }
}
export function hasOWMApiKey() {
    return owmApiKey && owmApiKey.length && owmApiKey !== OWM_DEFAULT_KEY;
}
export function getOWMApiKey() {
    return owmApiKey;
}

export interface OWMParams extends Partial<Coord> {
    id?: number; // cityId
    q?: string; // search query
}
export async function fetchOWM<T = any>(apiName: string, queryParams: OWMParams = {}) {
    return request<T>({
        url: `https://api.openweathermap.org/data/2.5/${apiName}`,
        method: 'GET',
        queryParams: {
            lang,
            units: 'metric',
            appid: owmApiKey,
            ...queryParams
        }
    });
}

export async function getCityName(pos: Coord) {
    const result = await fetchOWM<CityWeather>('weather', {
        lat: pos.lat,
        lon: pos.lon
    });
    return result;
}

export async function getOWMWeather(weatherLocation: WeatherLocation) {
    const coords = weatherLocation.coord;
    const result = await fetchOWM<OneCallResult>('onecall', coords);
    // console.log('test', JSON.stringify(result.daily));
    const r = {
        currently: weatherDataIconColors(
            {
                time: result.current.dt * 1000,
                temperature: Math.round(result.current.temp),
                pressure: result.current.pressure,
                humidity: result.current.humidity,
                cloudCover: result.current.clouds,
                windSpeed: result.current.wind_speed * 3.6,
                windGust: result.current.wind_gust * 3.6,
                windBearing: result.current.wind_deg,
                uvIndex: result.current.uvi,
                sunriseTime: result.current.sunrise * 1000,
                sunsetTime: result.current.sunset * 1000,
                icon: result.current.weather[0]?.icon,
                description: titlecase(result.current.weather[0]?.description)
            } as Currently,
            WeatherDataType.CURRENT,
            coords
        ),
        daily: {
            data: result.daily.map((data) => {
                const d = {} as DailyData;
                d.time = data.dt * 1000;
                d.icon = data.weather[0]?.icon;
                d.description = titlecase(data.weather[0]?.description);
                d.windSpeed = data.wind_speed * 3.6;
                d.windGust = data.wind_gust * 3.6;
                d.temperatureMin = Math.round(data.temp.min);
                d.temperatureMax = Math.round(data.temp.max);
                d.temperatureNight = Math.round(data.temp.night);

                d.precipProbability = data.pop;
                d.cloudCover = data.clouds;
                d.windBearing = data.wind_deg;
                d.humidity = data.humidity;
                d.pressure = data.pressure;
                d.sunriseTime = data.sunrise * 1000;
                d.sunsetTime = data.sunset * 1000;
                d.precipAccumulation = data.snow ? data.snow : data.rain ? data.rain : 0;
                d.uvIndex = data.uvi;

                weatherDataIconColors(d, WeatherDataType.DAILY, coords, data.rain, data.snow);
                d.hourly = [];
                return d;
            })
        },
        minutely: {
            data:
                result.minutely
                    ?.map((h) => ({
                        intensity: h.precipitation >= 0.76 ? 3 : h.precipitation >= 0.11 ? 2 : h.precipitation > 0 ? 1 : 0,
                        time: h.dt * 1000
                    }))
                    .filter((d, i) => i % 5 === 0) || []
        },
        alerts: result.alerts
    } as WeatherData;
    r.daily.data[0].hourly = result.hourly?.map((data) => {
        const d = {} as Hourly;
        d.time = data.dt * 1000;
        d.icon = data.weather[0]?.icon;
        d.description = titlecase(data.weather[0]?.description);
        d.windSpeed = data.wind_speed * 3.6; // max value
        d.temperature = Math.round(data.temp);

        d.windBearing = data.wind_deg;
        d.precipAccumulation = data.snow ? data.snow['1h'] : data.rain ? data.rain['1h'] : 0;
        d.precipProbability = data.pop;
        d.cloudCover = data.clouds;
        d.humidity = data.humidity;
        d.windGust = data.wind_gust * 3.6;
        d.pressure = data.pressure;
        weatherDataIconColors(d, WeatherDataType.HOURLY, coords, data.rain?.['1h'], data.snow?.['1h']);

        return d;
    });
    return r;
}
