import { Point, Feature, FeatureCollection, GeoJsonProperties } from 'geojson';

// export interface GeoJsonPoint {
//     type: "Point";
//     coordinates: [number, number];
// }

// export interface GeoJsonFeature {
//     type: "Feature";
//     geometry: GeoJsonPoint;
//     properties: any;
// }

// export interface GeoJsonFeatureCollection {
//     type: "FeatureCollection";
//     features: GeoJsonFeature[];
// }

// export interface GeoJsonProperties {
//     name: string,
//     description: string
// }

export function createGeoJsonPoint(longitude: number, latitude: number): Point {
    return {
        type: 'Point',
        coordinates: [longitude, latitude],
    };
}

export function createGeoJsonFeature(
    longitude: number,
    latitude: number,
    properties: GeoJsonProperties
): Feature {
    return {
        type: 'Feature',
        geometry: createGeoJsonPoint(longitude, latitude),
        properties: properties,
    };
}

export function createGeoJsonFeatureCollection(
    features: Feature[]
): FeatureCollection {
    return {
        type: 'FeatureCollection',
        features: features,
    };
}

export function generateGeoJson(coordinates: { latitude: number; longitude: number; properties: GeoJsonProperties }[]): FeatureCollection {
    const features: Feature[] = coordinates.map((coord) =>
        createGeoJsonFeature(coord.longitude, coord.latitude, coord.properties)
    );
    return createGeoJsonFeatureCollection(features);
}