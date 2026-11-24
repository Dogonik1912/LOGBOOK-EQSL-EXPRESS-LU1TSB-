/**
 * CW audio decoder engine for LogBook eQSL EXPRESS.
 * DSP core adapted from acesso/Signal-Decoder (0BSD), src/lib/cw/decoder.ts.
 * Copyright (C) 2025 smolgroot. Permission to use, copy, modify, and/or distribute
 * this software for any purpose with or without fee is hereby granted.
 */
const MORSE_TABLE: Record<string, string> = {
  '.-':'A','-...':'B','-.-.':'C','-..':'D','.':'E','..-.':'F','--.':'G','....':'H','..':'I',
  '.---':'J','-.-':'K','.-..':'L','--':'M','-.':'N','---':'O','.--.':'P','--.-':'Q','.-.':'R',
  '...':'S','-':'T','..-':'U','...-':'V','.--':'W','-..-':'X','-.--':'Y','--..':'Z',
  '.----':'1','..---':'2','...--':'3','....-':'4','.....':'5','-....':'6','--...':'7','---..':'8','----.':'9','-----':'0',
  '.-.-.-':'.','--..--':',','..--..':'?','.----.':"'",'-.-.--':'!','-..-.':'/','-.--.':'(','-.--.-':')',
  '.-...':'&','---...':':','-.-.-.':';','-...-':'=','.-.-.':'+','-....-':'-','..--.-':'_',
  '.-..-.':'"','...-..-':'$','.--.-.':'@','.-.-':'<AA>','...-.-':'<SK>','........':'<HH>'
};

export interface CWStats {
  wpm: number;
  adaptiveWpm: number;
  partialSymbol: string;
  toneDetected: boolean;
  snrDb: number | null;
  envelopeLevel: number;
}

export class CWAudioDecoder {
  private readonly sampleRate: number;
  private toneFreq: number;
  private filterQ: number;
  private bpB0=0; private bpB2=0; private bpA1=0; private bpA2=0;
  private bpX1=0; private bpX2=0; private bpY1=0; private bpY2=0;
  private envelope=0; private peak=0; private noiseFloor=1e-6;
  private readonly attackAlpha:number; private readonly releaseAlpha:number;
  private readonly peakRiseAlpha:number; private readonly peakFallAlpha:number;
  private readonly noiseDownAlpha:number; private readonly noiseUpAlpha:number;
  private isMark=false; private markSamples=0; private spaceSamples=0;
  private wordSpaceOut=false; private ditSamples:number; private adaptiveEstSamples:number;
  private adaptiveDitLength=true; private symbolBuffer=''; private squelchThreshold=0;
  onText?: (chars:string)=>void;
  onElement?: (type:'dot'|'dash')=>void;
  onCharDecoded?: (char:string,symbol:string)=>void;

  constructor(sampleRate:number,toneFreq=700,wpmInit=20,filterQ=8) {
    this.sampleRate=sampleRate; this.toneFreq=toneFreq; this.filterQ=filterQ;
    this.ditSamples=this.wpmToDit(wpmInit); this.adaptiveEstSamples=this.ditSamples;
    this.attackAlpha=1-Math.exp(-1/(.003*sampleRate));
    this.releaseAlpha=1-Math.exp(-1/(.005*sampleRate));
    this.peakRiseAlpha=1-Math.exp(-1/(.010*sampleRate));
    this.peakFallAlpha=1-Math.exp(-1/(.300*sampleRate));
    this.noiseDownAlpha=1-Math.exp(-1/(.050*sampleRate));
    this.noiseUpAlpha=1-Math.exp(-1/(10*sampleRate));
    this.setupFilter(toneFreq);
  }
  private setupFilter(freq:number) {
    const w0=2*Math.PI*freq/this.sampleRate, sin=Math.sin(w0), cos=Math.cos(w0);
    const alpha=sin/(2*this.filterQ), a0=1+alpha;
    this.bpB0=(sin/2)/a0; this.bpB2=-(sin/2)/a0;
    this.bpA1=(-2*cos)/a0; this.bpA2=(1-alpha)/a0;
    this.bpX1=this.bpX2=this.bpY1=this.bpY2=0;
  }
  setToneFreq(freq:number) { this.toneFreq=Math.max(250,Math.min(1600,freq)); this.setupFilter(this.toneFreq); }
  setFilterBandwidth(bandwidth:number) { this.filterQ=Math.max(1,Math.min(50,this.toneFreq/Math.max(30,bandwidth))); this.setupFilter(this.toneFreq); }
  setAdaptive(enabled:boolean) { this.adaptiveDitLength=enabled; }
  setWpm(wpm:number) { this.ditSamples=this.wpmToDit(Math.max(5,Math.min(60,wpm))); }
  setSquelch(threshold:number) { this.squelchThreshold=Math.max(0,threshold); }
  private wpmToDit(wpm:number) { return Math.round(1.2/Math.max(3,wpm)*this.sampleRate); }

  process(samples:Float32Array):CWStats {
    for(let i=0;i<samples.length;i++) {
      const x=samples[i];
      const y=this.bpB0*x+this.bpB2*this.bpX2-this.bpA1*this.bpY1-this.bpA2*this.bpY2;
      this.bpX2=this.bpX1; this.bpX1=x; this.bpY2=this.bpY1; this.bpY1=y;
      const abs=Math.abs(y), alpha=abs>this.envelope?this.attackAlpha:this.releaseAlpha;
      this.envelope+=alpha*(abs-this.envelope);
      if(this.envelope>this.peak) this.peak+=this.peakRiseAlpha*(this.envelope-this.peak);
      else this.peak*=1-this.peakFallAlpha;
      if(this.peak<1e-9)this.peak=1e-9;
      const diff=this.envelope-this.noiseFloor;
      this.noiseFloor+=diff<0?diff*this.noiseDownAlpha:diff*this.noiseUpAlpha;
      if(this.noiseFloor<1e-9)this.noiseFloor=1e-9;
      const gated=this.squelchThreshold>0&&this.envelope<this.squelchThreshold;
      const nowMark=!gated&&(this.isMark?this.envelope>this.peak*.25:this.envelope>this.peak*.5);
      if(nowMark!==this.isMark) {
        if(nowMark){this.handleSpaceEnd(this.spaceSamples);this.spaceSamples=0;this.wordSpaceOut=false;}
        else {this.handleMarkEnd(this.markSamples);this.markSamples=0;}
        this.isMark=nowMark;
      }
      if(this.isMark)this.markSamples++;
      else {
        this.spaceSamples++;
        if(!this.wordSpaceOut&&this.spaceSamples>=Math.round(this.ditSamples*5)&&this.symbolBuffer.length>0) {
          this.flushSymbol(); this.onText?.(' '); this.wordSpaceOut=true;
        }
      }
    }
    return this.getStats();
  }
  private handleMarkEnd(samples:number) {
    if(samples<this.ditSamples*.2)return;
    const dot=samples<this.ditSamples*2;
    this.symbolBuffer+=dot?'.':'-'; this.onElement?.(dot?'dot':'dash');
    if(this.symbolBuffer.length>8)this.flushSymbol();
    const measured=dot?samples:samples/3;
    this.adaptiveEstSamples=this.adaptiveEstSamples*.9+measured*.1;
    this.adaptiveEstSamples=Math.max(this.wpmToDit(60),Math.min(this.wpmToDit(5),this.adaptiveEstSamples));
    if(this.adaptiveDitLength)this.ditSamples=this.adaptiveEstSamples;
  }
  private handleSpaceEnd(samples:number) {
    if(samples<this.ditSamples*.3)return;
    if(samples>=this.ditSamples*1.5&&this.symbolBuffer.length>0)this.flushSymbol();
  }
  private flushSymbol() {
    if(!this.symbolBuffer)return;
    const symbol=this.symbolBuffer, char=MORSE_TABLE[symbol]??'?';
    this.onCharDecoded?.(char,symbol); this.onText?.(char); this.symbolBuffer='';
  }
  flushPending() {
    if(this.isMark){this.handleMarkEnd(this.markSamples);this.markSamples=0;this.isMark=false;}
    this.flushSymbol();
  }
  getStats():CWStats {
    return {wpm:Math.round(1.2/(this.ditSamples/this.sampleRate)),adaptiveWpm:Math.round(1.2/(this.adaptiveEstSamples/this.sampleRate)),
      partialSymbol:this.symbolBuffer,toneDetected:this.isMark,snrDb:this.noiseFloor>1e-9?10*Math.log10(Math.max(this.envelope/this.noiseFloor,1)):null,envelopeLevel:this.envelope};
  }
  reset() {
    this.bpX1=this.bpX2=this.bpY1=this.bpY2=0; this.envelope=0; this.peak=0; this.noiseFloor=1e-6;
    this.isMark=false; this.markSamples=this.spaceSamples=0; this.wordSpaceOut=false; this.symbolBuffer='';
    this.ditSamples=this.wpmToDit(20); this.adaptiveEstSamples=this.ditSamples;
  }
}
