import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as geoJSONUtils from "./utilities/geojson-utils";
import DataSetInterfaces = ComponentFramework.PropertyHelper.DataSetApi;
type DataSet = ComponentFramework.PropertyTypes.DataSet;

export class SiteActivityPointsComponent implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private _container: HTMLDivElement;
    private _context: ComponentFramework.Context<IInputs>;
    private _notifyOutputChanged: () => void;

    private _map: google.maps.Map | null = null;
    private _kmlUrl: string | null = null;
    private _initialLat = 0;
    private _initialLng = 0;
    private _initialZoom = 12;
    private _locationDataset: ComponentFramework.PropertyTypes.DataSet;
    private _geoJSON: geoJSONUtils.GeoJsonFeatureCollection;

    constructor() {}

    public async init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        state: ComponentFramework.Dictionary,
        container: HTMLDivElement
    ): Promise<void> {
        this._container = container;
        this._context = context;
        this._locationDataset = context.parameters.locationDataSet;

        // console.log('DATAset: ', this._locationDataset);
        
        // this.relatedTableDataset = context.parameters.relatedTableDataSet;
        // console.log('Related Table Dataset: ', this.relatedTableDataset);

        // context.parameters._locationDataset.linking.addLinkedEntity({
        //     name: "fot_sitemaptest",
        //     from: "fot_sitemaptestid",
        //     to: "fot_sitemaptest",
        //     alias: "ParentRelation",
        //     linkType: "outer"
        // });

        // const linkedEntities = context.parameters._locationDataset.linking.getLinkedEntities();
        // console.log('Linked Entities: ', linkedEntities);
        
        // initializeData?
        this._container.style.width = "100%";
        this._container.style.height = "800px";        

        // await this.getData( this._locationDataset);

        // this.loadGoogleMaps().then(() => {
        //     console.log("Google Maps API loaded successfully.");
        //     this.initializeMap();
        //     return true;
        // }).catch(error => {
        //     console.error("Google Maps API failed to load:", error);
        //     throw error;
        // });

        this.getData( this._locationDataset).then(async () => {
            console.log('DATAset: ', this._locationDataset);
            try {
                await this.loadGoogleMaps(this._context.parameters.googleApiKey.raw as string);
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

    private async getData(dataset: ComponentFramework.PropertyTypes.DataSet): Promise<void> {
        // (dataset as any).addColumn("fot_sitedesignfileurlplaintext", "ParentRelation");

        if (dataset?.sortedRecordIds && dataset.setSelectedRecordIds.length) {

            const initialLocationData = await this.getInitialLocationData(dataset.sortedRecordIds[0]);

            this._kmlUrl = this.getGoogleDriveDownloadLink(this.getGoogleDriveFileId(initialLocationData?.kmlUrl || null));
            this._initialLat = initialLocationData?.initialLatitude || 0;
            this._initialLng = initialLocationData?.initialLongitude || 0;
            // this._kmlUrl = await this.getKmlUrl(dataset.sortedRecordIds[0]);
            console.log ('initial location data: ', initialLocationData);
            
            const coordinates = dataset.sortedRecordIds.reduce(
                (arr: { latitude: number; longitude: number; properties?: geoJSONUtils.GeoJsonProperties }[], recordId) => {
                const record = dataset.records[recordId];
                // const latitude = record.getValue('latitude');
                // const longitude = record.getValue('longitude');
                // const name = record.getValue('name'); 
                // const description = record.getValue('description'); 

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

            this._geoJSON = geoJSONUtils.generateGeoJson(coordinates);
            console.log('GeoJSON: ', this._geoJSON);
        }
    }

    private async getInitialLocationData(id: string): Promise<{ kmlUrl: string, initialLatitude: number, initialLongitude: number } | null> {
    // private async getKmlUrl(id: string): Promise<string | null> {
        const linkedRecord = this._locationDataset.records[id].getValue("siteTest"); 
        const linkedRecordId = (linkedRecord as any).id.guid;

        console.log('Site Id value: ', linkedRecordId); 

        try {
            return await this.getInitialLocationDataFromLinkedEntity(linkedRecordId);            
        } catch (error) {
            console.log('Error getting Url: ', error); 
            return null;
        }
    }

    private async getInitialLocationDataFromLinkedEntity(entityId: string): Promise<{ kmlUrl: string, initialLatitude: number, initialLongitude: number } | null> {
        const linkedEntityTableName = this._context.parameters.initialLocationLinkedTableName.raw as string;
        const initialKmlUrlColumnName = this._context.parameters.initialKmlUrlColumnName.raw as string;
        const initialLatitudeColumnName = this._context.parameters.initialLatitudeColumnName.raw as string;
        const initialLongitudeColumnName = this._context.parameters.initialLongitudeColumnName.raw as string;

        console.log('Site linkedEntityTableName: ', linkedEntityTableName);
        console.log('Site initialKmlUrlColumnName: ', initialKmlUrlColumnName);
        console.log('Site initialLatitudeColumnName: ', initialLatitudeColumnName);
        console.log('Site initialLongitudeColumnName: ', initialLongitudeColumnName);

        try {
            const results = await this._context.webAPI.retrieveRecord(
                linkedEntityTableName,
                entityId,
                `?$select=${initialKmlUrlColumnName},${initialLatitudeColumnName},${initialLongitudeColumnName}`
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
        
        console.log('IN INITIALZE MAP CONTAINER: ', this._container);
        console.log('IN INITIALZE MAP KML URL: ', this._kmlUrl);
        console.log('IN INITIALZE MAP GEOJSON: ', this._geoJSON);
        
        if (!this._container) return;

        this._map = new google.maps.Map(this._container, {
            center: { lat: this._initialLat, lng: this._initialLng }, 
            // center: { lat: 42.6975, lng: 23.3242 }, 
            zoom: this._initialZoom
        });

        // If there's a KML file, add it to the map
        if (this._kmlUrl) {
            this.addKmlLayer(this._kmlUrl);
        }

        this._map.data.addGeoJson(this._geoJSON);

        // this.addGeoJSONListener();
        this._map.data.addListener('mouseover', (event) => {
            const properties = event.feature.getProperties();
            console.log('mouseover event: ', event);
            console.log('properties: ', properties);
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
        
            if (this._map) {
                console.log('ABOUT TO OPEN INFO WINDOW')
                infoWindow.open(this._map);
            } 
        });
    }

    /**
     * Adds a KML layer to the map.
     */
    private addKmlLayer(kmlUrl: string): void {
        if (!this._map) return;

        const kmlLayer = new google.maps.KmlLayer({
            url: kmlUrl,
            map: this._map,
            preserveViewport: true
        });

        kmlLayer.addListener("status_changed", () => {
            if (kmlLayer.getStatus() !== "OK") {
                console.error("Error loading KML:", kmlLayer.getStatus());
            }
        });
    }

    private addGeoJSONListener(): void {
        if (!this._map) {
            return;
        }

        this._map.data.addListener('mouseover', (event) => {
            const properties = event.feature.getProperties();
            console.log('click event: ', event);
            console.log('properties: ', properties);
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
        
            if (this._map) {
                console.log('ABOUT TO OPEN INFO WINDOW')
                infoWindow.open(this._map);
            } 
        });
    }

    public updateView(context: ComponentFramework.Context<IInputs>): void {
        // this.bindLookupDataset( this._locationDataset);
        // this._locationDataset = context.parameters._locationDataset;

        // if (!this._locationDataset || this._locationDataset.loading) {
        //     this._container.innerHTML = "Loading...";
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

        // this._container.innerHTML = outputHtml;
        // Here you would add your map component integration.
    }


    public getOutputs(): IOutputs {
        return {};
    }


    public destroy(): void {
        this._container.innerHTML = "";
    }
}
