import { Component, ViewChild, OnInit, Input, ViewChildren } from '@angular/core';
import { HttpClient, HttpRequest, HttpEvent } from '@angular/common/http';
import { CornerstoneDirective } from './cornerstone.directive';
import { ThumbnailDirective } from './thumbnail.directive';

declare const cornerstone;
declare const cornerstoneTools;


@Component({
  selector: 'dicom-viewer',
  templateUrl: './dicom-viewer.component.html',
  styleUrls: ['./dicom-viewer.component.css']
})
export class DICOMViewerComponent implements OnInit {
  
  @ViewChild(CornerstoneDirective, { static: true }) viewPort: CornerstoneDirective; // the main cornerstone viewport
  @ViewChildren(ThumbnailDirective) thumbnails: Array<ThumbnailDirective>;

  @Input() public enableViewerTools = false; // enable viewer tools
  @Input() public enablePlayTools = false;   // enable Play Clip tools
  @Input() public downloadImagesURL = ''     // download images URL
  @Input() public maxImagesToLoad = 9999999; // limit for the automatic loading of study images

  public seriesList = []; // list of series on the images being displayed
  public currentSeriesIndex = 0;
  public currentSeries: any = {};
  public imageCount = 0; // total image count being viewed

  private loadedImages = [];
  private imageIdList = [];
  private element: any;
  private targetImageCount = 0;
  public loadingImages = false;

  private annotationsList = []; // keep track of all tools/annotations used
  private toolList = ["Pan", "Zoom", "Wwwc", "RectangleRoi", "Length"];
  private selectedTool = '';
  private baseUrl = 'http://18.118.139.210:5000/';
  public realImage: any;
 
  
  constructor(private http: HttpClient) { }


  ngOnInit() {
    this.element = this.viewPort.element;
  }
  

  // control message for more images to load
  public get moreImagestoLoad(): string {
    if (this.loadedImages.length < this.imageIdList.length && !this.loadingImages) { // are there any more images to load?
      const imagesToLoad = (this.maxImagesToLoad <= 0) ? (this.imageIdList.length - this.loadedImages.length) : Math.min(this.maxImagesToLoad, this.imageIdList.length - this.loadedImages.length);
      return imagesToLoad.toString();
    } else return '';
  }


  // control display of a loading images progress indicator
  public get showProgress(): any { return { display: (this.loadingImages) ? 'inline' : 'none' } };


  // control styling of a button for a tool that can be selected
  public showSelectedTool(tool: string): any { 
    if (tool == this.selectedTool) { 
      return { 'color': 'rgb(211, 34, 81)', 'border': 'inset 2px', 'border-color': 'whitesmoke', 'background-color': '#343434' }; 
    } 
    else {
      return { 'color': 'white', 'border-color': '#888888' };
    }
  };


  // control styling of the StackScroll toggle button
  public get showButtonToggleEnabled(): any { 
    if (this.viewPort.isScrollEnabled) { 
      return { 'color': 'rgb(211, 34, 81)', 'border': 'inset 2px', 'border-color': 'whitesmoke', 'background-color': '#343434' }; 
    } 
    else {
      return { 'color': 'white', 'border-color': '#888888' };
    }
  };


  // control styling of the Play/Stop button
  public get showPlayStop(): any { 
    if (this.viewPort.isClipPlaying) { 
      return { 'border-color': 'whitesmoke', 'border-style': 'inset 2px' }; 
    } 
    else {
      return { 'color': 'white', 'border-color': '#888888' };
    }
  };


  /**
   * Load dicom images for display
   *
   * @param imageIdList list of imageIds to load and display
   */
  loadStudyImages(imageIdList: Array<any>) {
    this.element = this.viewPort.element;
    this.imageIdList = imageIdList;
    this.viewPort.resetViewer();
    this.viewPort.resetImageCache(); // clean up image cache
    this.seriesList = []; // start a new series list
    this.currentSeriesIndex = 0; // always display first series
    this.loadedImages = []; // reset list of images already loaded

    // loop thru all imageIds, load and cache them for exhibition (up the the maximum limit defined)
    const maxImages = (this.maxImagesToLoad <= 0) ? imageIdList.length : Math.min(this.maxImagesToLoad, imageIdList.length);
    this.loadingImages = true; // activate progress indicator
    this.targetImageCount = maxImages;
    for (let index = 0; index < maxImages; index++) {
      const imageId = imageIdList[index];
      cornerstone.loadAndCacheImage(imageId).then(imageData => { this.imageLoaded(imageData) });
    }
  }


  /**
   *
   * @param imageData the dicom image data
   */
  private imageLoaded(imageData) {
    // build list of series in all loadded images
    const series = {
      studyID: imageData.data.string('x0020000d'),
      seriesID: imageData.data.string('x0020000e'),
      seriesNumber: imageData.data.intString('x00200011'),
      studyDescription: imageData.data.string('x00081030'),
      seriesDescription: imageData.data.string('x0008103e'),
      imageCount: 1,
      imageList: [imageData]
    }
    // if this is a new series, add it to the list
    let seriesIndex = this.seriesList.findIndex(item => item.seriesID === series.seriesID);
    if (seriesIndex < 0) {
      seriesIndex = this.seriesList.length;
      this.seriesList.push(series);
      this.seriesList.sort((a, b) => {
        if (a.seriesNumber > b.seriesNumber) return 1;
        if (a.seriesNumber < b.seriesNumber) return -1;
        return 0;
      })
    } else {
      let seriesItem = this.seriesList[seriesIndex];
      seriesItem.imageCount++;
      seriesItem.imageList.push(imageData);
      seriesItem.imageList.sort((a, b) => {
        if (a.data.intString('x00200013') > b.data.intString('x00200013')) return 1;
        if (a.data.intString('x00200013') < b.data.intString('x00200013')) return -1;
        return 0;
      })
    }

    this.loadedImages.push(imageData); // save to images loaded

    if (seriesIndex === this.currentSeriesIndex) {
      this.showSeries(this.currentSeriesIndex)
    }

    if (this.loadedImages.length >= this.targetImageCount) { // did we finish loading images?
      this.loadingImages = false; // deactivate progress indicator
    }

    this.enablePan();
  }


  public showSeries(index) {
    if (this.viewPort.isClipPlaying) {
      this.stopClip();
    }

    this.currentSeriesIndex = index;
    this.currentSeries = this.seriesList[index];
    this.imageCount = this.currentSeries.imageCount; // get total image count
    this.viewPort.resetImageCache(); // clean up image cache

    for (let i = 0; i < this.currentSeries.imageList.length; i++) {
      const imageData = this.currentSeries.imageList[i];
      this.viewPort.addImageData(imageData);
    }
  }


  /**
   * Image scroll methods
   */
  public nextImage() {
    if (this.imageCount > 1 && this.viewPort.currentIndex < this.imageCount && !this.viewPort.isClipPlaying) {
      this.viewPort.nextImage();
    }
  }


  public previousImage() {
    if (this.viewPort.currentIndex > 0 && !this.viewPort.isClipPlaying) {
      this.viewPort.previousImage();
    }
  }


  /**
   * Methods to activate/deactivate viewer tools
   */
  // deactivate all tools
  public resetAllTools() {
    if (this.imageCount > 0) {
      this.selectedTool = this.toolList[0];
      this.viewPort.resetAllTools();
      if (this.viewPort.isClipPlaying) {
        this.stopClip();
      }
    }
  }


  // activate windowing
  public enableWindowing() {
    if (this.imageCount > 0) {
      cornerstoneTools.setToolActiveForElement(this.element, 'Wwwc', { mouseButtonMask: 1 }, ['Mouse']);
      cornerstoneTools.setToolActiveForElement(this.element, 'Pan', { mouseButtonMask: 2 }, ['Mouse']); // pan right mouse
      this.selectedTool = this.toolList[2];
    }
  }


  // activate zoom
  public enableZoom() {
    if (this.imageCount > 0) {
      cornerstoneTools.setToolActiveForElement(this.element, 'Zoom', { mouseButtonMask: 1 }, ['Mouse']); // zoom left mouse
      cornerstoneTools.setToolActiveForElement(this.element, 'Pan', { mouseButtonMask: 2 }, ['Mouse']); // pan right mouse
      this.selectedTool = this.toolList[1];
    }
  }


  // activate pan
  public enablePan() {
    if (this.imageCount > 0) {
      cornerstoneTools.setToolActiveForElement(this.element, 'Pan', { mouseButtonMask: 1 }, ['Mouse']);
      cornerstoneTools.setToolActiveForElement(this.element, 'Pan', { mouseButtonMask: 2 }, ['Mouse']); // pan right mouse
      this.selectedTool = this.toolList[0];
    }
  }


  // activate image scroll
  public enableScroll() {
    if (this.imageCount > 0) {
      cornerstoneTools.setToolActiveForElement(this.element, 'StackScroll', { mouseButtonMask: 1 }, ['Mouse']);
    }
  }


  public toggleScroll() {
    if (!this.viewPort.isClipPlaying) {
      this.viewPort.toggleScroll();
    }
  }


  // activate length measurement
  public enableLength() {
    if (this.imageCount > 0) {
      cornerstoneTools.setToolActiveForElement(this.element, 'Length', { mouseButtonMask: 1 }, ['Mouse']);
      cornerstoneTools.setToolActiveForElement(this.element, 'Pan', { mouseButtonMask: 2 }, ['Mouse']); // pan right mouse
      this.annotationsList.push('Length');
      this.selectedTool = this.toolList[4];
    }
  }


  // Download data as a .json file
  public download(filename: any, text: any) {
    let element = document.createElement('a');
    element.setAttribute('href', 'data:text/json;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename + '.json');

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
  }


  // save tool states - download annotation data for all images
  public saveToolState() {
    
    let exportArray = this.exportImageArray();

    this.download("annotations", JSON.stringify(exportArray));
  }

  public exportImageArray(){
    let exportArray = [];

    // Save viewer state to restore later
    let lastSeriesSeen = this.currentSeriesIndex;
    let lastCurrentImageIndex = this.viewPort.currentIndex;
    
    for (let i = 0; i < this.seriesList.length; ++i) {

      this.showSeries(i);

      for (let image of this.seriesList[i].imageList) {
        console.log(image);
        let imageAnnotations = {
          studyID: image.data.string('x0020000d'),
          seriesID: image.data.string('x0020000e'),
          SOPInstanceUID: image.data.string('x00080018'),
          annotations: {
            lengthData: null,
            rectangleData: null
          }
        }
        
        let getter = cornerstoneTools.getElementToolStateManager(this.element).get;
        let lengthToolData = getter(this.element, 'Length');
        let rectangleRoiToolData = getter(this.element, 'RectangleRoi');

        if (!lengthToolData) imageAnnotations.annotations.lengthData = null;
        else imageAnnotations.annotations.lengthData = lengthToolData.data;
        
        if (!rectangleRoiToolData) imageAnnotations.annotations.rectangleData = null;
        else imageAnnotations.annotations.rectangleData = rectangleRoiToolData.data;
        
        if (lengthToolData || rectangleRoiToolData) {
          exportArray.push(imageAnnotations);
        }

        this.nextImage();
      }

      return exportArray;
    }

    // Restore viewer state after iterating through images
    this.showSeries(lastSeriesSeen);

    while (this.viewPort.currentIndex < lastCurrentImageIndex) {
      this.viewPort.nextImage();
    }
  }

  // Load tool states from a .json file, restoring them to the viewer
  public loadToolState(event) {
    if (this.imageCount < 1)
      return; // Must have image(s) loaded to restore annotations

    let file = event[0];
    let reader = new FileReader();
    reader.readAsText(file, "UTF-8");

    reader.onload = ((evt) => {

      let idToAnnotation = new Map();
      let jsonObj = JSON.parse(evt.target.result as string);

      // Populate the image id -> annotation map
      for (let element of jsonObj) { 
        idToAnnotation.set(element.SOPInstanceUID, element.annotations);
      }

      // Save viewer state to restore later
      let lastSeriesSeen = this.currentSeriesIndex;
      let lastCurrentImageIndex = this.viewPort.currentIndex;
      
      // Flip through all loaded images and restore tool state for each
      for (let i = 0; i < this.seriesList.length; ++i) {

        this.showSeries(i);

        for (let image of this.seriesList[i].imageList) {

          let currSOPInstanceUID = image.data.string('x00080018');
          let rectData, lengthData;

          if (idToAnnotation.has(currSOPInstanceUID)) {
            let annotations = idToAnnotation.get(currSOPInstanceUID);
            rectData = annotations.rectangleData;
            lengthData = annotations.lengthData;
          }
          
          // Restore RectangleRoi annotations for current image
          if (rectData != null) {
            for (let item of rectData) {
              cornerstoneTools.addToolState(this.element, 'RectangleRoi', item);
            }
          }

          // Restore Length annotations for current image
          if (lengthData != null) {
            for (let item of lengthData) {
              cornerstoneTools.addToolState(this.element, 'Length', item);
            }
          }
          
          this.nextImage();
        }
      }

      // Trigger the annotations to render again by activating tools
      this.enableRectangle();
      this.enableLength();
      this.enablePan();

      // Restore viewer state after iterating through images
      this.showSeries(lastSeriesSeen);

      while (this.viewPort.currentIndex < lastCurrentImageIndex) {
        this.viewPort.nextImage();
      }

      this.viewPort.refreshImage();
    });

    // File error handler
    reader.onerror = (() => {
      console.log("Error reading JSON file.");
    });
  }


  // activate Rectangle ROI
  public enableRectangle() {
    if (this.imageCount > 0) {
      cornerstoneTools.setToolActiveForElement(this.element, 'RectangleRoi', { mouseButtonMask: 1 }, ['Mouse']);
      cornerstoneTools.setToolActiveForElement(this.element, 'Pan', { mouseButtonMask: 2 }, ['Mouse']); // pan right mouse
      this.annotationsList.push('RectangleRoi');
      this.selectedTool = this.toolList[3];
    }
  }


  // Toggle clip playing
  public togglePlay() {
    if (this.viewPort.isClipPlaying) {
      this.stopClip();
    }
    else {
      this.playClip();
    }
  }

  
  // Play Clip
  public playClip() {
    if (this.imageCount > 0) {
      if (this.viewPort.isScrollEnabled) {
        this.viewPort.toggleScroll(); // Important to not change image while clip playing
      }
      let frameRate = 10;
      let stackState = cornerstoneTools.getToolState(this.element, 'stack');
      if (stackState) {
        frameRate = stackState.data[0].frameRate;
        // Play at a default 10 FPS if the framerate is not specified
        if (frameRate === undefined || frameRate === null || frameRate === 0) {
          frameRate = 10;
        }
      }
      this.viewPort.togglePlayClip();
      cornerstoneTools.playClip(this.element, frameRate);
    }
  }


  // Stop Clip
  public stopClip() {
    this.viewPort.togglePlayClip();
    cornerstoneTools.stopClip(this.element);
    this.viewPort.refreshImage();
  }


  // invert image
  public invertImage() {
    if (this.imageCount > 0) {
      let viewport = cornerstone.getViewport(this.element);
      // Toggle invert
      viewport.invert = !viewport.invert;
      cornerstone.setViewport(this.element, viewport);
    }
  }


  // Undo Last Annotation
  /*
  This method currently removes all annotations from the last used tool. 
  Example: if the user used the Length tool twice, followed by the RectangleROI tool twice, and then 
  clicks "Undo", this method will clear both of the rectangle annotations. If the user clicks undo again,
  this method will clear both of the length annotations.
  */
  public undoAnnotation() {
    let popped = this.annotationsList.pop();
    cornerstoneTools.clearToolState(this.element, popped);
    this.viewPort.displayImage(this.viewPort.imageList[this.viewPort.currentIndex]);
  }


  // reset image
  public resetImage() {
    if (confirm("Are you sure you want to reset all annotations?") == true) {
      if (this.imageCount > 0) {
        cornerstoneTools.clearToolState(this.element, "Length");
        cornerstoneTools.clearToolState(this.element, "Angle");
        cornerstoneTools.clearToolState(this.element, "Probe");
        cornerstoneTools.clearToolState(this.element, "EllipticalRoi");
        cornerstoneTools.clearToolState(this.element, "RectangleRoi");

        this.viewPort.displayImage(this.viewPort.imageList[this.viewPort.currentIndex]);
      } 
    } 
  }


  public clearImage() {
    this.viewPort.resetViewer();
    this.viewPort.resetImageCache();
    this.seriesList = []; // list of series on the images being displayed
    this.currentSeriesIndex = 0;
    this.currentSeries = {};
    this.imageCount = 0; // total image count being viewed
  }

  public getActualImage(image){
    // this.realImage = image;
    image.arrayBuffer().then((arrayBuffer) => {
      this.realImage = new Blob([new Uint8Array(arrayBuffer)], {type: image.type });
        console.log(this.realImage);
    });
  }

 


//////DEBUG FROM HERE: Send pixels in roi box as Base64 via AJAX API to flask python backend and decode to image for backend testing///////////////////////////////



  public redirectToGit(){
    
    element = cornerstone.getEnabledElements()[0]

    w = element.image.width
    h = element.image.height

    toolState = cornerstoneTools.globalImageIdSpecificToolStateManager.saveToolState();

    box_startx = Math.floor(toolState["dicomfile:0"].RectangleRoi.data[0].handles.start.x)
    box_starty = Math.floor(toolState["dicomfile:0"].RectangleRoi.data[0].handles.start.y)
    box_endx = Math.floor(toolState["dicomfile:0"].RectangleRoi.data[0].handles.end.x)
    box_endy = Math.floor(toolState["dicomfile:0"].RectangleRoi.data[0].handles.end.y)

    roi = []
    for (var x = box_startx; x < box_endx; x++) {
    for (var y = box_starty; y < box_endy; y++) {
    roi.push(element.image.getPixelData()[x * w + y])
    }
    }

    base64 = btoa(roi)

//////////////////////////////////////////////
var roi= new Uint8Array((box_endx-box_startx)*(box_endy-box_starty))
var p = 0;
for (var x = box_startx; x < box_endx; x++) {
  for (var y = box_starty; y < box_endy; y++) {
    roi[p] = element.image.getPixelData()[x * w + y]);
    p++;
  }
}

function tob64( buffer ) {
    var binary = '';
    var bytes = new Uint8Array( buffer );
    var len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
        binary += String.fromCharCode( bytes[ i ] );
    }
    return window.btoa( binary );
}


var base64 = tob64(roi.buffer);
////////////////////END///////////////////////


