import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as geoJSONBuildHelper from "./helpers/geojson-build-helper";
import * as geoJSONStyleHelper from "./helpers/geojson-style-helper";
import * as config from "./configuration/configuration";
import { kml } from "@tmcw/togeojson";
import toGeoJSON from '@mapbox/togeojson';
// import { DOMParser } from 'xmldom';
// import { DOMParser } from 'geoxml3';
import * as geoXML3 from 'geoxml3';
import DataSetInterfaces = ComponentFramework.PropertyHelper.DataSetApi;
import { FeatureCollection, GeoJsonProperties, Geometry, Point } from "geojson";
import { MarkerWithLabel } from "@googlemaps/markerwithlabel";
type DataSet = ComponentFramework.PropertyTypes.DataSet;

export class SiteActivityPointsComponent implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private container: HTMLDivElement;
    private context: ComponentFramework.Context<IInputs>;
    private notifyOutputChanged: () => void;

    private map: google.maps.Map | null = null;
    private AdvancedMarkerElement: typeof google.maps.marker.AdvancedMarkerElement | null = null;
    private infoWindow = new google.maps.InfoWindow({
        content: ''
    });
    private kmlUrl: string | null = null;
    private initialGeoJSON: FeatureCollection<Geometry | null, GeoJsonProperties> | null;
    private initialLat = 0;
    private initialLng = 0;
    private initialZoom = 13;
    private locationDataset: ComponentFramework.PropertyTypes.DataSet;
    private geoJSON: FeatureCollection | null;
    private initialLocationTableName: string;
    private initialFileColumnName: string;
    private initialFileUrlColumnName: string;
    private initialLatitudeColumnName: string;
    private initialLongitudeColumnName: string;

    constructor() {}

    public async init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        state: ComponentFramework.Dictionary,
        container: HTMLDivElement
    ): Promise<void> {
        this.container = container;
        this.context = context;
        this.locationDataset = context.parameters.locationDataSet;

        console.log('CONTEXT: ', this.context);
        console.log('DATAset: ', this.locationDataset);

        this.container.style.width = "100%";
        this.container.style.height = "800px";   
        this.initializeParameters();     
        console.log('Params initialLocationTableName: ', this.initialLocationTableName);
        console.log('Params initialFileUrlColumnName: ', this.initialFileUrlColumnName);
        console.log('Params initialLatitudeColumnName: ', this.initialLatitudeColumnName);
        console.log('Params initialLongitudeColumnName: ', this.initialLongitudeColumnName);

        try {
            await this.loadGoogleMaps(this.context.parameters.googleApiKey.raw as string);
            console.log('Google Maps API loaded successfully.');
            // return this.initializeMap()
        } catch (error) {
            console.error('Google Maps API failed to load:', error);
            throw error;
        }

        try {
            const { AdvancedMarkerElement } = await google.maps.importLibrary("marker") as google.maps.MarkerLibrary;
            this.AdvancedMarkerElement = AdvancedMarkerElement;
        } catch (error) {
            console.error('Cannot load Advanced Marker Elements');
            throw error;
        }

        // this.initializeData( this.locationDataset).then(async () => {
        //     console.log('DATAset: ', this.locationDataset);
        //     try {
        //         await this.loadGoogleMaps(this.context.parameters.googleApiKey.raw as string);
        //         console.log("Google Maps API loaded successfully.");
        //         return this.initializeMap();
        //     } catch (error) {
        //         console.error("Google Maps API failed to load:", error);
        //         throw error;
        //     }
        // }).catch(error => {
        //     console.error("Error loading initial location data:", error);
        //     throw error;
        // });                 
    }

    private initializeParameters(): void {
        this.initialLocationTableName = this.context.parameters.initialLocationTableName.raw as string || config.initialLocationTableName;
        this.initialFileColumnName = this.context.parameters.initialFileColumnName.raw as string || config.initialFileColumnName;
        this.initialFileUrlColumnName = this.context.parameters.initialFileUrlColumnName.raw as string || config.initialFileUrlColumnName;
        this.initialLatitudeColumnName = this.context.parameters.initialLatitudeColumnName.raw as string || config.initialLatitudeColumnName;
        this.initialLongitudeColumnName = this.context.parameters.initialLongitudeColumnName.raw as string || config.initialLongitudeColumnName;
    }

    private async getLocationData(dataset: ComponentFramework.PropertyTypes.DataSet): Promise<void> {
        const initialLocationEntityId = this.getInitialLocationEntityId();
        console.log('Initial location entity id: ', initialLocationEntityId);
        const initialLocationData = await this.getInitialLocationData(initialLocationEntityId);

        // this.kmlUrl = this.getGoogleDriveDownloadLink(this.getGoogleDriveFileId(initialLocationData?.kmlUrl || null));
        this.initialGeoJSON = initialLocationData?.initialGeoJSON || null;
        this.kmlUrl = initialLocationData?.kmlUrl || null;
        this.initialLat = initialLocationData?.initialLatitude || 0;
        this.initialLng = initialLocationData?.initialLongitude || 0;
        console.log ('initial location data: ', initialLocationData);
        console.log ('initial geoJSON: ', JSON.stringify(this.initialGeoJSON));

        if (dataset?.sortedRecordIds && dataset?.sortedRecordIds.length) {
            
            const coordinates = dataset.sortedRecordIds.reduce(
                (arr: { latitude: number; longitude: number; properties: GeoJsonProperties }[], recordId) => {
                const record = dataset.records[recordId];
                arr.push({
                    latitude: (record.getValue('latitude') as number),
                    longitude: (record.getValue('longitude') as number),
                    properties: {
                        name: record.getValue('name') as string,
                        description: record.getValue('description') as string,
                        category: (record.getValue('category') as any)?.name || null,
                        dateAndTime: record.getValue('dateAndTime') || null
                    }
                });
                return arr;
            },[]);

            this.geoJSON = coordinates.length ? geoJSONBuildHelper.generateGeoJson(coordinates) : null;
            console.log('GeoJSON: ', this.geoJSON);
        }
    }

    private getInitialLocationEntityId(): string | null {
        const entityTypeName = (this.context as any).page?.entityTypeName;
        console.log('Entity type name: ', entityTypeName);
        return entityTypeName === this.initialLocationTableName ? (this.context as any).page?.entityId : null;
    }

    private async getInitialLocationData(initialLocationEntityId: string | null): 
        Promise<{ kmlUrl: string | null, initialLatitude: number, initialLongitude: number, initialGeoJSON: FeatureCollection<Geometry | null, GeoJsonProperties> | null } | null> {
        if (!initialLocationEntityId) {
            return null;
        }

        try {
            return await this.getInitialLocationDataFromLinkedEntityFile(initialLocationEntityId);            
        } catch (error) {
            console.log('Error getting Url: ', error); 
            return null;
        }
    }

    private async getInitialLocationDataFromLinkedEntityFile(entityId: string): 
        Promise<{ kmlUrl: string | null, initialLatitude: number, initialLongitude: number, initialGeoJSON: FeatureCollection<Geometry | null, GeoJsonProperties> | null } | null> {
        
        const orgUrl = (this.context as any).page.getClientUrl();
        console.log('ORG URL: ', orgUrl);
        
        try {
            const results = await this.context.webAPI.retrieveRecord(
                this.initialLocationTableName,
                entityId,
                `?$select=${this.initialFileColumnName},${this.initialLatitudeColumnName},${this.initialLongitudeColumnName}`
            );

            console.log('Results from API call: ', results);

            
            const downloadUrl = `${orgUrl}/api/data/v9.2/${this.initialLocationTableName}s(${entityId})/${this.initialFileColumnName}/$value`;
            // const downloadUrl = `https://fot-dev.api.crm.dynamics.com/api/data/v9.2/${this.initialLocationTableName}(${entityId})/${this.initialFileColumnName}/$value`;

            console.log('Download Url: ', downloadUrl);

            // const { kmlUrl, initialGeoJSON }  = await this.getKmlFromFile(downloadUrl);
            // console.log('KML Url from blob: ', kmlUrl);
            // const kmlUrl = await this.getKmlFromFile(results[this.initialFileColumnName]);

            const initialGeoJSON = await this.getGeoJSONFromKmlFile(downloadUrl);            

            if (results) {
                return {
                    kmlUrl: null,
                    initialLatitude: results[this.initialLatitudeColumnName],
                    initialLongitude: results[this.initialLongitudeColumnName],
                    initialGeoJSON
                }
            } else {
                return null;
            }
        } catch (error) {
            console.error("Error retrieving initial location data:", error);
            return null;
        }
    }

    private async getInitialLocationDataFromLinkedEntityUrl(entityId: string): Promise<{ kmlUrl: string, initialLatitude: number, initialLongitude: number } | null> {
        try {
            const results = await this.context.webAPI.retrieveRecord(
                this.initialLocationTableName,
                entityId,
                `?$select=${this.initialFileUrlColumnName},${this.initialLatitudeColumnName},${this.initialLongitudeColumnName}`
            );

            console.log('Results from API call: ', results);

            if (results) {
                return {
                    kmlUrl: results[this.initialFileUrlColumnName],
                    initialLatitude: results[this.initialLatitudeColumnName],
                    initialLongitude: results[this.initialLongitudeColumnName]
                }
            } else {
                return null;
            }
        } catch (error) {
            console.error("Error retrieving initial location data:", error);
            return null;
        }
    }

    private loadGoogleMaps(googleApiKey: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if ((window as any).google && (window as any).google.maps) {
                resolve(); // Google Maps is already loaded
                return;
            }

            const script = document.createElement("script");
            script.src = `https://maps.googleapis.com/maps/api/js?key=${googleApiKey}&v=beta`;
            script.async = true;
            script.defer = true;

            script.onload = () => {
                if ((window as any).google && (window as any).google.maps) {
                    resolve();
                } else {
                    reject(new Error("Google Maps API failed to load correctly."));
                }
            };
    
            script.onerror = () => reject(new Error("Failed to load Google Maps API script."));

            document.head.appendChild(script);
        });
    }


    private getGoogleDriveFileId(url: string | null) {

        if (!url) {
            return null;
        }

        const regex = /\/d\/([^/]+)/; // Regular expression to match /d/ and capture the ID
        const match = url.match(regex);

        if (match && match[1]) {
          return match[1];
        } else {
          return null; // Or handle the case where the ID is not found
        }

    }

    private getGoogleDriveDownloadLink(fileId: string | null): string {
        return fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : '';
    }

    private initializeMap(): void {
        
        console.log('IN INITIALZE MAP CONTAINER: ', this.container);
        
        if (!this.container) return;

        this.map = new google.maps.Map(this.container, {
            center: { lat: this.initialLat, lng: this.initialLng }, 
            zoom: this.initialZoom,
            mapId: 'DEMO_MAP_ID'
        } as any);
        
        console.log('MAP: ', this.map);

        this.map?.addListener('mapcapabilities_changed', () => {
            const mapCapabilities = (this.map as any)?.getMapCapabilities();
          
            console.log('MAP capabilities: ', mapCapabilities);
          });
        
        // this.map.addListener('click', (event) => {
        //     console.log('MAP EVENT: ', event);
        // });
    }

    private addKmlLayer(kmlUrl: string | null): void {
        if (!this.map || !this.kmlUrl) return;

        const kmlLayer = new google.maps.KmlLayer({
            url: this.kmlUrl,
            map: this.map,
            preserveViewport: true,
            suppressInfoWindows: false
        });

        kmlLayer.addListener("status_changed", () => {
            if (kmlLayer.getStatus() !== "OK") {
                console.error("Error loading KML:", kmlLayer.getStatus());
            }
        });

        console.log('z-index of the kml layer: ', kmlLayer.getZIndex());
    }

    private attachAddFeatureEventListener(): void {
        
        if (!this.map) {
            return;
        }

        this.map.data.addListener('addfeature', (event: any) => {
            console.log('Event: ', event);

            const feature = event.feature;
            console.log('event feature: ', feature);
            const geometry = feature.getGeometry();
            console.log('event feature geometry: ', geometry);
            const geometryType = geometry.getType();
            console.log('event feature type: ', geometryType);
            const dateAndTimeText = feature.getProperty('dateAndTime') ? new Date(feature.getProperty('dateAndTime')).toLocaleString() : null ;
            console.log('event dateAndTimeText: ', dateAndTimeText);
      
            if (geometryType === 'Point' && dateAndTimeText) {
                const position = geometry.get();

                const label = document.createElement("div");
                label.textContent = dateAndTimeText; // Set the label text
                label.style.color = "white";
                label.style.backgroundColor = "black";
                label.style.padding = "5px";
                label.style.borderRadius = "5px";
                label.style.fontSize = "12px";
      
                // Create a marker with a label
                new this.AdvancedMarkerElement!({
                    position,
                    map: (this.map as any),
                    content: label
                });
                // console.log('Marker: ', marker);
            }
        });
    }

    private attachClickEventListener(): void {
        if (!this.map) {
            return;
        }

        // const infoWindow = new google.maps.InfoWindow({
        //     content: ''
        // });

        this.map.data.addListener('click', (event: any) => {

                // if (this.infoWindow.isOpen) {
                    this.infoWindow.close();
                    console.log('closed the info window!');
                // }

                // console.log('Event: ', event);
                // console.log('Event LAtLng: ', event.latLng);
                const feature = event.feature;
                // console.log('event feature: ', feature);
                const name = feature.getProperty('name');
                // console.log('nameProp: ', name);
                const description = feature.getProperty('description');
                // console.log('description: ', description);
                const dateAndTime = feature.getProperty('dateAndTime') ? new Date(feature.getProperty('dateAndTime')).toLocaleString() : null ;
                // console.log('dateAndTimeProp: ', feature.getProperty('dateAndTime'));
                // console.log('Date from dateAndTimeProp: ', new Date(feature.getProperty('dateAndTime')));
                // console.log('dateAndTime: ', dateAndTime);
                const category = feature.getProperty('category');
                // console.log('category: ', category);

                const content = `
                <div>
                    <p>${dateAndTime || ''}</p>
                    <h4 class="category">${category || ''}</h4>
                    <p class="description">${description || ''}</p>
                    
                </div>
                `;

                const geometry = event.feature.getGeometry();
                console.log('get geometry: ', geometry);

                const geometryType = geometry.getType();
                console.log('geometryType: ', geometryType);

                const geometryPosition = geometryType === 'Point' ? geometry?.get() : event.latLng;
                console.log('get geomertry get: ', geometryPosition);

                this.infoWindow.setContent(content);
                this.infoWindow.setPosition(geometryPosition);
                this.infoWindow.setOptions({ pixelOffset: new google.maps.Size(0, -20), maxWidth: 265, minWidth: 240 } as any);
                (this.infoWindow as any).setHeaderContent(name);
            
                if (this.map) {
                    console.log('ABOUT TO OPEN INFO WINDOW')
                    this.infoWindow.open(this.map);
                } 
            }
        );
    }

    // private async getKmlFromFile(downloadUrl: string): Promise<string | null> {
    private async getGeoJSONFromKmlFile(downloadUrl: string): Promise< FeatureCollection<Geometry | null, GeoJsonProperties> | null > {

        // if(!fileReference) {
        //     return null;
        // }
        // const downloadUrl = fileReference.downloadUrl;
        // console.log('DOWNLOAD URL: ', downloadUrl);
        
        if(!downloadUrl) {
            return null;
        }

        return fetch(downloadUrl)
            .then(response => {
                console.log('RESPONSE FROM FETCH CALL: ', response);
                return response.blob()
            })
            .then(blob => blob.text())
            .then(kmlText => {
                console.log('KML TEXT: ', kmlText);
                // const parser = new DOMParser();
                // const kmlDoc = parser.parseFromString(kmlText, 'text/xml');
                // const initialGeoJSON = kml(kmlDoc);

                // const dataUrl = 'data:application/vnd.google-earth.kml+xml;charset=utf-8,' + encodeURIComponent(kmlText);
                // console.log('data Url: ', dataUrl);

                // const kmlBlob = new Blob([kmlText], { type: 'application/vnd.google-earth.kml+xml' });
                // console.log('object Url: ', URL.createObjectURL(kmlBlob));

                console.log('GEOXML 3', geoXML3);
                const kmlDoc = new DOMParser().parseFromString(kmlText, 'text/xml');
                console.log('kmlDOC: ', kmlDoc);
                const initialGeoJSON = toGeoJSON.kml(kmlDoc);

                return initialGeoJSON;

                // const serializer = new XMLSerializer();
                // const kmlString = serializer.serializeToString(kmlDoc);
                // console.log('KML STRING: ', kmlString);

                // const kmlBlob = new Blob([kmlText], { type: 'application/vnd.google-earth.kml+xml' });
                // return URL.createObjectURL(kmlBlob);

                // const dataUrl = 'data:application/vnd.google-earth.kml+xml;charset=utf-8,' + encodeURIComponent(kmlString);
                // const dataUrl = 'data:application/kml+xml;charset=utf-8,' + encodeURIComponent(kmlString);
                // console.log('DATA URL: ', dataUrl);

                // return dataUrl;
            })
            .catch(error => {
                console.error("Error downloading or parsing KML:", error);
                return null;
            });
    }

    private addGeoJSONOnMap(geoJSON: FeatureCollection<Geometry | null, GeoJsonProperties> | null): void {
        if (!geoJSON || !this.map) {
            return;
        }

        this.map.data.addGeoJson(geoJSON);
    }

    private displayGeoJSONFromDataSet(): void {
        const features = this.geoJSON?.features;

        if (!features?.length) {
            return;
        }

        features.forEach(feature => {
            const coords = (feature.geometry as Point)?.coordinates;
            const latLng = new google.maps.LatLng(coords[1], coords[0]);

            // console.log('Event: ', event);

            console.log('feature: ', feature);
            const geometry = feature.geometry;
            console.log('feature geometry: ', geometry);
            const dateAndTimeText = feature.properties?.['dateAndTime'] ? new Date(feature.properties?.['dateAndTime']).toLocaleString() : null ;
            console.log('dateAndTimeText: ', dateAndTimeText);
            const dateAndTimeFragments = dateAndTimeText?.split(',');
            const date = dateAndTimeFragments?.[0];
            const time = (dateAndTimeFragments?.[1])?.trim() || '';
            const name = feature.properties?.['name'];
            const description = feature.properties?.['description'];
            const category = feature.properties?.['category'];

            const infoWindowContent = `
            <div>
                <p>${dateAndTimeText || ''}</p>
                <h4 class="category">${category || ''}</h4>
                <p class="description">${description || ''}</p>                
            </div>`;

            const dateAndTimeTag = document.createElement('div');
            dateAndTimeTag.className = 'date-and-time-tag';
            dateAndTimeTag.innerHTML = `<p>${date || ''}</p><p>${time || ''}</p>`;

            const marker = new MarkerWithLabel({
                position: latLng,
                clickable: true,
                map: this.map,
                labelContent: dateAndTimeTag, // can also be HTMLElement
                labelAnchor: new google.maps.Point(18, -40),
                labelClass: 'date-and-time-tag'
            });
            // const marker = new this.AdvancedMarkerElement!({
            //     position: latLng,
            //     map: this.map,
            //     // content: dateAndTimeTag,
            //     gmpClickable: true,
            // });

            // if (dateAndTimeText) {
            //     marker.content = dateAndTimeTag;
            // }
            
            marker.addListener('click', (event: any) => {
                this.infoWindow.close();
                console.log('closed the info window!');
                this.infoWindow.setContent(infoWindowContent);
                this.infoWindow.setPosition(latLng);
                this.infoWindow.setOptions({ pixelOffset: new google.maps.Size(0, -20), maxWidth: 265, minWidth: 240 } as any);
                // this.infoWindow.setOptions({ maxWidth: 265, minWidth: 240 } as any);
                (this.infoWindow as any).setHeaderContent(name);
                this.infoWindow.open(this.map);
            });
        })      
    }

    public updateView(context: ComponentFramework.Context<IInputs>): void {

        console.log('in update view!!!');
        this.getLocationData( this.locationDataset).then(() => {
            console.log('This KML URL: ', this.kmlUrl);
            console.log('This GEOJSON: ', this.geoJSON);

            this.initializeMap();
            // this.addKmlLayer(this.kmlUrl);

            // this.attachAddFeatureEventListener();
            this.attachClickEventListener();

            this.addGeoJSONOnMap(this.initialGeoJSON);
            this.map?.data.setStyle(geoJSONStyleHelper.setStylesByFeatureType);

            // this.addGeoJSONOnMap(this.geoJSON);
            this.displayGeoJSONFromDataSet();
            console.log('adding listener in updateView');

            return true;
        }).catch(error => {
            console.error("Error loading initial location data:", error);
            throw error;
        });  
    }


    public getOutputs(): IOutputs {
        return {};
    }


    public destroy(): void {
        this.container.innerHTML = "";
    }
}
