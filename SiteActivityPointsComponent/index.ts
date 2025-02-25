import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as geoJSONUtils from "./utilities/geojson-utils";
import * as config from "./configuration/configuration";
import DataSetInterfaces = ComponentFramework.PropertyHelper.DataSetApi;
type DataSet = ComponentFramework.PropertyTypes.DataSet;

export class SiteActivityPointsComponent implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private container: HTMLDivElement;
    private context: ComponentFramework.Context<IInputs>;
    private notifyOutputChanged: () => void;

    // private _map: google.maps.Map | null = null;
    private kmlUrl: string | null = null;
    private initialLat = 0;
    private initialLng = 0;
    private initialZoom = 13;
    private locationDataset: ComponentFramework.PropertyTypes.DataSet;
    private geoJSON: geoJSONUtils.GeoJsonFeatureCollection;
    private initialLocationTableName: string;
    private initialFileColumnName: string;
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

        this.container.style.width = "100%";
        this.container.style.height = "800px";   
        this.initializeParameters();     
        console.log('Params initialLocationTableName: ', this.initialLocationTableName);
        console.log('Params initialFileColumnName: ', this.initialFileColumnName);
        console.log('Params initialLatitudeColumnName: ', this.initialLatitudeColumnName);
        console.log('Params initialLongitudeColumnName: ', this.initialLongitudeColumnName);

        this.initializeData( this.locationDataset).then(async () => {
            console.log('DATAset: ', this.locationDataset);
            try {
                await this.loadGoogleMaps(this.context.parameters.googleApiKey.raw as string);
                console.log("Google Maps API loaded successfully.");
                return this.initializeMap();
            } catch (error) {
                console.error("Google Maps API failed to load:", error);
                throw error;
            }
        }).catch(error => {
            console.error("Error loading initial location data:", error);
            throw error;
        });                 
    }

    private initializeParameters(): void {
        this.initialLocationTableName = this.context.parameters.initialLocationTableName.raw as string || config.initialLocationTableName;
        this.initialFileColumnName = this.context.parameters.initialFileColumnName.raw as string || config.initialFileColumnName;
        this.initialLatitudeColumnName = this.context.parameters.initialLatitudeColumnName.raw as string || config.initialLatitudeColumnName;
        this.initialLongitudeColumnName = this.context.parameters.initialLongitudeColumnName.raw as string || config.initialLongitudeColumnName;
    }

    private async initializeData(dataset: ComponentFramework.PropertyTypes.DataSet): Promise<void> {
        const initialLocationEntityId = this.getInitialLocationEntityId();
        console.log('Initial location entity id: ', initialLocationEntityId);
        const initialLocationData = await this.getInitialLocationData(initialLocationEntityId);

        this.kmlUrl = this.getGoogleDriveDownloadLink(this.getGoogleDriveFileId(initialLocationData?.kmlUrl || null));
        this.initialLat = initialLocationData?.initialLatitude || 0;
        this.initialLng = initialLocationData?.initialLongitude || 0;
        console.log ('initial location data: ', initialLocationData);

        if (dataset?.sortedRecordIds && dataset?.sortedRecordIds.length) {
            
            const coordinates = dataset.sortedRecordIds.reduce(
                (arr: { latitude: number; longitude: number; properties?: geoJSONUtils.GeoJsonProperties }[], recordId) => {
                const record = dataset.records[recordId];
                arr.push({
                    latitude: (record.getValue('latitude') as number),
                    longitude: (record.getValue('longitude') as number),
                    properties: {
                        name: record.getValue('name') as string,
                        description: record.getValue('description') as string
                    }
                });
                return arr;
            },[]);

            this.geoJSON = geoJSONUtils.generateGeoJson(coordinates);
            console.log('GeoJSON: ', this.geoJSON);
        }
    }

    private getInitialLocationEntityId(): string | null {
        const entityTypeName = (this.context as any).page?.entityTypeName;
        console.log('Entity type name: ', entityTypeName);
        return entityTypeName === this.initialLocationTableName ? (this.context as any).page?.entityId : null;
    }

    private async getInitialLocationData(initialLocationEntityId: string | null): Promise<{ kmlUrl: string, initialLatitude: number, initialLongitude: number } | null> {
        if (!initialLocationEntityId) {
            return null;
        }

        try {
            return await this.getInitialLocationDataFromLinkedEntity(initialLocationEntityId);            
        } catch (error) {
            console.log('Error getting Url: ', error); 
            return null;
        }
    }

    private async getInitialLocationDataFromLinkedEntity(entityId: string): Promise<{ kmlUrl: string, initialLatitude: number, initialLongitude: number } | null> {
        try {
            const results = await this.context.webAPI.retrieveRecord(
                this.initialLocationTableName,
                entityId,
                `?$select=${this.initialFileColumnName},${this.initialLatitudeColumnName},${this.initialLongitudeColumnName}`
            );

            console.log('Results from API call: ', results);

            if (results) {
                return {
                    kmlUrl: results.fot_sitedesignfileurlplaintext,
                    initialLatitude: results.fot_latitude,
                    initialLongitude: results.fot_longitude
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
            script.src = `https://maps.googleapis.com/maps/api/js?key=${googleApiKey}`;
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


    /**
     * Initializes the Google Map and KML layer.
     */
    private initializeMap(): void {
        
        console.log('IN INITIALZE MAP CONTAINER: ', this.container);
        console.log('IN INITIALZE MAP KML URL: ', this.kmlUrl);
        console.log('IN INITIALZE MAP GEOJSON: ', this.geoJSON);
        
        if (!this.container) return;

        const map = new google.maps.Map(this.container, {
            center: { lat: this.initialLat, lng: this.initialLng }, 
            zoom: this.initialZoom
        });

        if (this.kmlUrl) {
            // this.addKmlLayer(this.kmlUrl);
            const kmlLayer = new google.maps.KmlLayer({
                url: this.kmlUrl,
                map,
                preserveViewport: true
            });
        }

        map.data.addGeoJson(this.geoJSON);

        console.log('MAP: ', map);
        // this.addGeoJSONListener();
        
        // map.data.addListener('mouseover', (event) => {
        //     const properties = event.feature.getProperties();
        //     console.log('mouseover event: ', event);
        //     console.log('properties: ', properties);

        //     const name = event.feature.getProperty('name');
        //     const description = event.feature.getProperty('description');
        //     const position = event.latLng;
        //     console.log('name: ', name);
        //     console.log('description: ', description);
        //     console.log('position: ', position);

        //     const content = `
        //       <div>
        //         <h3>${properties.name}</h3>
        //         <p>${properties.description}</p>
        //       </div>
        //     `;
        
        //     console.log('get geometry: ', event.feature.getGeometry());
        //     console.log('get geomertry get: ', event.feature.getGeometry().get());

        //     const infoWindow = new google.maps.InfoWindow({
        //         content: content,
        //         position: event.feature.getGeometry().get(),
        //     });
        
        //     if (map) {
        //         console.log('ABOUT TO OPEN INFO WINDOW')
        //         infoWindow.open(map);
        //     } 
        // });
        
        map.data.addListener('click', function (event: any) {
            const properties = event.feature.getProperties();
            console.log('click event: ', event);
            console.log('properties: ', properties);

            const name = event.feature.getProperty('name');
            const description = event.feature.getProperty('description');
            const position = event.latLng;
            console.log('name: ', name);
            console.log('description: ', description);
            console.log('position: ', position);

            const content = `
              <div>
                <h3>${properties.name}</h3>
                <p>${properties.description}</p>
              </div>
            `;
        
            console.log('get geometry: ', event.feature.getGeometry());
            console.log('get geomertry get: ', event.feature.getGeometry().get());

            const infoWindow = new google.maps.InfoWindow({
                content: content,
                position: event.feature.getGeometry().get(),
            });
        
            if (map) {
                console.log('ABOUT TO OPEN INFO WINDOW')
                infoWindow.open(map);
            } 
        });
    }

    /**
     * Adds a KML layer to the map.
     */
    // private addKmlLayer(kmlUrl: string): void {
        // if (!this._map) return;

        // const kmlLayer = new google.maps.KmlLayer({
        //     url: kmlUrl,
        //     map: this._map,
        //     preserveViewport: true
        // });

        // kmlLayer.addListener("status_changed", () => {
        //     if (kmlLayer.getStatus() !== "OK") {
        //         console.error("Error loading KML:", kmlLayer.getStatus());
        //     }
        // });
    // }

    // private addGeoJSONListener(): void {
    //     if (!this._map) {
    //         return;
    //     }

    //     this._map.data.addListener('mouseover', (event) => {
    //         const properties = event.feature.getProperties();
    //         console.log('click event: ', event);
    //         console.log('properties: ', properties);
    //         const content = `
    //           <div>
    //             <h3>${properties.name}</h3>
    //             <p>${properties.description}</p>
    //           </div>
    //         `;
        
    //         console.log('get geometry: ', event.feature.getGeometry());
    //         console.log('get geomertry get: ', event.feature.getGeometry().get());

    //         const infoWindow = new google.maps.InfoWindow({
    //             content: content,
    //             position: event.feature.getGeometry().get(),
    //         });
        
    //         if (this._map) {
    //             console.log('ABOUT TO OPEN INFO WINDOW')
    //             infoWindow.open(this._map);
    //         } 
    //     });
    // }

    public updateView(context: ComponentFramework.Context<IInputs>): void {
        // this.bindLookupDataset( this.locationDataset);
        // this.locationDataset = context.parameters.locationDataset;

        // if (!this.locationDataset || this.locationDataset.loading) {
        //     this.container.innerHTML = "Loading...";
        //     return;
        // }

        // const outputHtml = "";
        // const kmlUrls: string[] = [];

        // if (this.dataset.sortedRecordIds) {
        //     this.dataset.sortedRecordIds.forEach((recordId) => {
        //         const record = this.dataset.records[recordId];
        //         if (record) {
        //             const lat = record.getValue("Latitude");
        //             const lng = record.getValue("Longitude");

        //             outputHtml += `<div><p>Latitude: ${lat}</p><p>Longitude: ${lng}</p></div>`;

        //             if (record.getValue("LookupToOtherTable") && record.getValue("LookupToOtherTable").id) {
        //                 const lookupRecord = this.dataset.linkedEntities["LookupToOtherTable"].records[record.getValue("LookupToOtherTable").id];
        //                 if (lookupRecord && lookupRecord.getValue("kmlUrl")) {
        //                     kmlUrls.push(lookupRecord.getValue("kmlUrl"));
        //                 }
        //             }
        //         }
        //     });
        // }

        // if (kmlUrls.length > 0) {
        //     outputHtml += "<h3>KML URLs:</h3><ul>";
        //     kmlUrls.forEach((url) => {
        //         outputHtml += `<li>${url}</li>`;
        //     });
        //     outputHtml += "</ul>";
        // }

        // this.container.innerHTML = outputHtml;
        // Here you would add your map component integration.
    }


    public getOutputs(): IOutputs {
        return {};
    }


    public destroy(): void {
        this.container.innerHTML = "";
    }
}
